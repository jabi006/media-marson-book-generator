import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { AiService } from '../ai/ai.service';
import { BookWorkflowStatus } from '../common/enums/book-workflow-status.enum';
import { ChapterGenerationStatus } from '../common/enums/chapter-generation-status.enum';
import { ReviewStatus } from '../common/enums/review-status.enum';
import { ExportService } from '../export/export.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { UpdateChapterReviewDto } from './dto/update-chapter-review.dto';
import { UpdateFinalReviewDto } from './dto/update-final-review.dto';
import { UpdateOutlineReviewDto } from './dto/update-outline-review.dto';
import { BookRecord, ChapterRecord, WorkflowEventRecord } from './book.types';

interface UploadedSpreadsheetFile {
  buffer: Buffer;
  originalname: string;
}

@Injectable()
export class BooksService {
  constructor(
    private readonly storageService: SupabaseStorageService,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
    private readonly exportService: ExportService,
  ) {}

  async listBooks() {
    return this.storageService.listBooks();
  }

  async getBook(bookId: string) {
    return this.findBookOrThrow(bookId);
  }

  async deleteBook(bookId: string) {
    const book = await this.findBookOrThrow(bookId);

    await this.storageService.deleteBook(
      bookId,
      [book.outputPdfPath].filter((value): value is string => Boolean(value)),
    );

    return {
      deleted: true,
      id: bookId,
      title: book.title,
    };
  }

  async importBooksFromFile(file: UploadedSpreadsheetFile | undefined) {
    if (!file) {
      throw new BadRequestException(
        'Please upload a CSV or Excel file first.',
      );
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'The uploaded file is empty. Add at least one book before importing.',
      );
    }

    const preparedBooks = rows.map((row) => {
      const title = this.readString(row, ['title']);
      const notesOnOutlineBefore = this.readString(row, [
        'notes_on_outline_before',
        'notesOnOutlineBefore',
      ]);

      if (!title || !notesOnOutlineBefore) {
        throw new BadRequestException(
          'Each row must include both a title and outline notes before import.',
        );
      }

      return {
        title,
        sourceFileName: file.originalname,
        notesOnOutlineBefore,
        notesOnOutlineAfter: this.readString(row, [
          'notes_on_outline_after',
          'notesOnOutlineAfter',
        ]),
        statusOutlineNotes: this.readReviewStatus(
          this.readString(row, ['status_outline_notes', 'statusOutlineNotes']),
        ),
        finalReviewNotes: this.readString(row, [
          'final_review_notes',
          'finalReviewNotes',
        ]),
        finalReviewNotesStatus: this.readReviewStatus(
          this.readString(row, [
            'final_review_notes_status',
            'finalReviewNotesStatus',
          ]),
        ),
      };
    });

    const duplicateTitlesInFile = this.findDuplicateTitles(
      preparedBooks.map((book) => book.title),
    );

    if (duplicateTitlesInFile.length > 0) {
      throw new BadRequestException(
        `This file contains duplicate title(s): ${duplicateTitlesInFile.join(', ')}. Please keep each title unique.`,
      );
    }

    const existingBooks = await this.storageService.listBooks();
    const existingTitles = new Map(
      existingBooks.map((book) => [book.title.trim().toLowerCase(), book.title]),
    );
    const duplicateExistingTitles = preparedBooks
      .map((book) => existingTitles.get(book.title.trim().toLowerCase()))
      .filter((title): title is string => Boolean(title));

    if (duplicateExistingTitles.length > 0) {
      throw new BadRequestException(
        `These title(s) already exist: ${duplicateExistingTitles.join(', ')}. Please remove them from the file or rename them.`,
      );
    }

    const books = await Promise.all(
      preparedBooks.map(async (book) => {
        const createdBook = this.buildNewBookRecord(book);
        await this.storageService.saveBook(createdBook);
        return createdBook;
      }),
    );

    return {
      importedCount: books.length,
      books,
    };
  }

  async generateOutline(bookId: string) {
    const book = await this.findBookOrThrow(bookId);

    if (!book.notesOnOutlineBefore.trim()) {
      await this.markBook(
        book,
        BookWorkflowStatus.OutlinePaused,
        'Outline generation paused because notes_on_outline_before is missing.',
      );
      throw new BadRequestException(
        'Add outline notes before generating the outline.',
      );
    }

    const outline = await this.aiService.generateOutline({
      title: book.title,
      notesOnOutlineBefore: book.notesOnOutlineBefore,
      existingOutline: book.outlineText,
      notesOnOutlineAfter: book.notesOnOutlineAfter,
    });

    const timestamp = this.now();
    const updatedBook: BookRecord = {
      ...book,
      outlineText: outline.outlineText,
      workflowStatus: BookWorkflowStatus.OutlineReady,
      chapters: outline.chapters.map((chapter) => ({
        id: randomUUID(),
        bookId,
        chapterNumber: chapter.number,
        title: chapter.title,
        outlineSummary: chapter.description,
        content: null,
        summary: null,
        chapterNotesStatus: null,
        chapterNotes: null,
        generationStatus: ChapterGenerationStatus.Pending,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      events: this.prependEvent(
        book.events,
        this.buildEvent(
          'outline_ready',
          'Outline is ready and waiting for editorial review.',
        ),
      ),
      updatedAt: timestamp,
    };

    await this.storageService.saveBook(updatedBook);

    await this.notificationsService.sendWorkflowEmail({
      title: book.title,
      subject: `Outline ready for review: ${book.title}`,
      message: 'The outline has been generated and is ready for editor review.',
    });

    return updatedBook;
  }

  async updateOutlineReview(bookId: string, dto: UpdateOutlineReviewDto) {
    const book = await this.findBookOrThrow(bookId);
    const status = dto.statusOutlineNotes ?? book.statusOutlineNotes;
    const notes = dto.notesOnOutlineAfter ?? book.notesOnOutlineAfter;

    const updatedBook: BookRecord = {
      ...book,
      notesOnOutlineAfter: notes,
      statusOutlineNotes: status,
      workflowStatus: this.resolveOutlineWorkflowStatus(status, notes),
      events: this.prependEvent(
        book.events,
        this.buildEvent(
          'outline_review_updated',
          `Outline review status updated to ${status ?? 'unset'}.`,
        ),
      ),
      updatedAt: this.now(),
    };

    await this.storageService.saveBook(updatedBook);
    return updatedBook;
  }

  async generateChapter(bookId: string, chapterNumber: number) {
    const book = await this.findBookOrThrow(bookId);
    const chapter = book.chapters.find(
      (item) => item.chapterNumber === chapterNumber,
    );

    if (!chapter) {
      throw new NotFoundException('Chapter not found.');
    }

    if (!book.outlineText) {
      throw new BadRequestException(
        'Generate and review the outline before creating chapters.',
      );
    }

    if (book.statusOutlineNotes !== ReviewStatus.NoNotesNeeded) {
      throw new BadRequestException(
        'Mark the outline review as "No notes needed" before generating chapters.',
      );
    }

    const previousChapters = book.chapters.filter(
      (item) => item.chapterNumber < chapterNumber,
    );
    const hasUnapprovedPreviousChapter = previousChapters.some(
      (item) => item.generationStatus !== ChapterGenerationStatus.Approved,
    );

    if (hasUnapprovedPreviousChapter) {
      throw new BadRequestException(
        'Approve the earlier chapters before generating the next one.',
      );
    }

    const previousSummaries = previousChapters
      .map((item) => item.summary)
      .filter((item): item is string => Boolean(item));

    const generatedChapter = await this.aiService.generateChapter({
      bookTitle: book.title,
      chapterNumber,
      chapterTitle: chapter.title,
      chapterDescription: chapter.outlineSummary,
      outlineText: book.outlineText,
      priorChapterSummaries: previousSummaries,
      chapterNotes: chapter.chapterNotes,
    });

    const timestamp = this.now();
    const nextChapters = book.chapters.map((item) =>
      item.chapterNumber === chapterNumber
        ? {
            ...item,
            content: generatedChapter.content,
            summary: generatedChapter.summary,
            generationStatus: ChapterGenerationStatus.ReadyForReview,
            updatedAt: timestamp,
          }
        : item,
    );

    const updatedBook: BookRecord = {
      ...book,
      chapters: nextChapters,
      workflowStatus: BookWorkflowStatus.ChapterReady,
      events: this.prependEvent(
        book.events,
        this.buildEvent(
          'chapter_ready',
          `Chapter ${chapterNumber} is ready for editorial review.`,
          chapter.id,
        ),
      ),
      updatedAt: timestamp,
    };

    await this.storageService.saveBook(updatedBook);

    await this.notificationsService.sendWorkflowEmail({
      title: book.title,
      subject: `Chapter ${chapterNumber} ready for review`,
      message: `Chapter ${chapterNumber} has been generated and is waiting for chapter notes.`,
    });

    return updatedBook;
  }

  async updateChapterReview(
    bookId: string,
    chapterNumber: number,
    dto: UpdateChapterReviewDto,
  ) {
    const book = await this.findBookOrThrow(bookId);
    const chapter = book.chapters.find(
      (item) => item.chapterNumber === chapterNumber,
    );

    if (!chapter) {
      throw new NotFoundException('Chapter not found.');
    }

    const status = dto.chapterNotesStatus ?? chapter.chapterNotesStatus;
    const notes = dto.chapterNotes ?? chapter.chapterNotes;
    const timestamp = this.now();

    const nextChapters = book.chapters.map((item) =>
      item.chapterNumber === chapterNumber
        ? {
            ...item,
            chapterNotes: notes,
            chapterNotesStatus: status,
            generationStatus: this.resolveChapterGenerationStatus(status, notes),
            updatedAt: timestamp,
          }
        : item,
    );

    const updatedBook: BookRecord = {
      ...book,
      chapters: nextChapters,
      workflowStatus: this.resolveBookWorkflowAfterChapterReview(
        nextChapters,
        chapterNumber,
        status,
        notes,
      ),
      events: this.prependEvent(
        book.events,
        this.buildEvent(
          'chapter_review_updated',
          `Chapter ${chapterNumber} review status updated to ${status ?? 'unset'}.`,
          chapter.id,
        ),
      ),
      updatedAt: timestamp,
    };

    await this.storageService.saveBook(updatedBook);
    return updatedBook;
  }

  async updateFinalReview(bookId: string, dto: UpdateFinalReviewDto) {
    const book = await this.findBookOrThrow(bookId);
    const status = dto.finalReviewNotesStatus ?? book.finalReviewNotesStatus;
    const notes = dto.finalReviewNotes ?? book.finalReviewNotes;

    const updatedBook: BookRecord = {
      ...book,
      finalReviewNotesStatus: status,
      finalReviewNotes: notes,
      workflowStatus:
        status === ReviewStatus.NoNotesNeeded || Boolean(notes?.trim())
          ? BookWorkflowStatus.ReadyForFinalReview
          : BookWorkflowStatus.FinalPaused,
      events: this.prependEvent(
        book.events,
        this.buildEvent(
          'final_review_updated',
          `Final review status updated to ${status ?? 'unset'}.`,
        ),
      ),
      updatedAt: this.now(),
    };

    await this.storageService.saveBook(updatedBook);
    return updatedBook;
  }

  async compileBook(bookId: string) {
    const book = await this.findBookOrThrow(bookId);

    const hasIncompleteChapter = book.chapters.some(
      (chapter) =>
        !chapter.content ||
        chapter.generationStatus !== ChapterGenerationStatus.Approved,
    );

    if (book.chapters.length === 0 || hasIncompleteChapter) {
      throw new BadRequestException(
        'Generate and approve every chapter before compiling the final PDF.',
      );
    }

    const allowedToCompile =
      book.finalReviewNotesStatus === ReviewStatus.NoNotesNeeded ||
      Boolean(book.finalReviewNotes?.trim());

    if (!allowedToCompile) {
      await this.markBook(
        book,
        BookWorkflowStatus.FinalPaused,
        'Final compilation paused because final review approval is incomplete.',
      );
      throw new BadRequestException(
        'Mark the final review as "No notes needed" or add final review notes before compiling.',
      );
    }

    const pdfBuffer = await this.exportService.exportBookToPdf(
      book,
      book.chapters,
      book.finalReviewNotes,
    );
    const outputPdfFileName = `${this.toSafeFileName(book.title)}.pdf`;
    const outputPdfPath = this.storageService.buildPdfObjectPath(
      book.id,
      outputPdfFileName,
    );

    await this.storageService.uploadPdf(outputPdfPath, pdfBuffer);

    const updatedBook: BookRecord = {
      ...book,
      outputPdfPath,
      outputPdfFileName,
      bookOutputStatus: 'ready',
      workflowStatus: BookWorkflowStatus.Completed,
      events: this.prependEvent(
        book.events,
        this.buildEvent(
          'book_compiled',
          'Final draft compiled and PDF download is ready.',
        ),
      ),
      updatedAt: this.now(),
    };

    await this.storageService.saveBook(updatedBook);

    await this.notificationsService.sendWorkflowEmail({
      title: book.title,
      subject: `Final draft compiled: ${book.title}`,
      message: 'The final PDF draft is ready to download.',
    });

    return updatedBook;
  }

  async getPdfFile(bookId: string) {
    const book = await this.findBookOrThrow(bookId);

    if (!book.outputPdfPath) {
      throw new NotFoundException(
        'This book has not been compiled to PDF yet.',
      );
    }

    return {
      buffer: await this.storageService.downloadFile(book.outputPdfPath),
      contentType: 'application/pdf',
      fileName:
        book.outputPdfFileName ?? `${this.toSafeFileName(book.title)}.pdf`,
    };
  }

  private async findBookOrThrow(bookId: string) {
    const book = await this.storageService.getBook(bookId);

    if (!book) {
      throw new NotFoundException('Book not found.');
    }

    return {
      ...book,
      chapters: [...book.chapters].sort(
        (left, right) => left.chapterNumber - right.chapterNumber,
      ),
      events: [...book.events].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    };
  }

  private buildNewBookRecord(input: {
    title: string;
    sourceFileName: string | null;
    notesOnOutlineBefore: string;
    notesOnOutlineAfter?: string | null;
    statusOutlineNotes?: ReviewStatus | null;
    finalReviewNotesStatus?: ReviewStatus | null;
    finalReviewNotes?: string | null;
  }): BookRecord {
    const timestamp = this.now();

    return {
      id: randomUUID(),
      title: input.title,
      sourceFileName: input.sourceFileName,
      notesOnOutlineBefore: input.notesOnOutlineBefore,
      outlineText: null,
      notesOnOutlineAfter: input.notesOnOutlineAfter ?? null,
      statusOutlineNotes: input.statusOutlineNotes ?? null,
      finalReviewNotesStatus: input.finalReviewNotesStatus ?? null,
      finalReviewNotes: input.finalReviewNotes ?? null,
      workflowStatus: BookWorkflowStatus.Imported,
      bookOutputStatus: 'not_ready',
      outputPdfPath: null,
      outputPdfFileName: null,
      chapters: [],
      events: [this.buildEvent('book_imported', 'Book imported into workspace.')],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private resolveOutlineWorkflowStatus(
    status: ReviewStatus | null,
    notes?: string | null,
  ) {
    if (status === ReviewStatus.Yes) {
      return notes?.trim()
        ? BookWorkflowStatus.OutlineReady
        : BookWorkflowStatus.WaitingOutlineNotes;
    }

    if (status === ReviewStatus.NoNotesNeeded) {
      return BookWorkflowStatus.ChapterReady;
    }

    return BookWorkflowStatus.OutlinePaused;
  }

  private resolveChapterGenerationStatus(
    status: ReviewStatus | null,
    notes?: string | null,
  ) {
    if (status === ReviewStatus.Yes) {
      return notes?.trim()
        ? ChapterGenerationStatus.ReadyForReview
        : ChapterGenerationStatus.WaitingForNotes;
    }

    if (status === ReviewStatus.NoNotesNeeded) {
      return ChapterGenerationStatus.Approved;
    }

    return ChapterGenerationStatus.Paused;
  }

  private resolveChapterWorkflowStatus(
    status: ReviewStatus | null,
    notes?: string | null,
  ) {
    if (status === ReviewStatus.Yes) {
      return notes?.trim()
        ? BookWorkflowStatus.ChapterReady
        : BookWorkflowStatus.WaitingChapterNotes;
    }

    if (status === ReviewStatus.NoNotesNeeded) {
      return BookWorkflowStatus.ChapterReady;
    }

    return BookWorkflowStatus.ChapterPaused;
  }

  private resolveBookWorkflowAfterChapterReview(
    chapters: ChapterRecord[],
    chapterNumber: number,
    status: ReviewStatus | null,
    notes?: string | null,
  ) {
    const chapterWorkflowStatus = this.resolveChapterWorkflowStatus(status, notes);

    if (status !== ReviewStatus.NoNotesNeeded) {
      return chapterWorkflowStatus;
    }

    const allApproved = chapters.every((chapter) => {
      if (chapter.chapterNumber === chapterNumber) {
        return true;
      }

      return chapter.generationStatus === ChapterGenerationStatus.Approved;
    });

    return allApproved
      ? BookWorkflowStatus.ReadyForFinalReview
      : BookWorkflowStatus.ChapterReady;
  }

  private async markBook(
    book: BookRecord,
    workflowStatus: BookWorkflowStatus,
    message: string,
  ) {
    const updatedBook: BookRecord = {
      ...book,
      workflowStatus,
      events: this.prependEvent(
        book.events,
        this.buildEvent('workflow_paused', message),
      ),
      updatedAt: this.now(),
    };

    await this.storageService.saveBook(updatedBook);

    await this.notificationsService.sendWorkflowEmail({
      title: 'Book workflow paused',
      subject: 'Book workflow paused',
      message,
    });
  }

  private prependEvent(
    events: WorkflowEventRecord[],
    event: WorkflowEventRecord,
  ) {
    return [event, ...events].slice(0, 25);
  }

  private buildEvent(type: string, message: string, chapterId?: string | null) {
    return {
      id: randomUUID(),
      chapterId: chapterId ?? null,
      createdAt: this.now(),
      message,
      type,
    };
  }

  private now() {
    return new Date().toISOString();
  }

  private readString(
    row: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    const key = keys.find((candidate) => row[candidate] !== undefined);
    if (!key) {
      return undefined;
    }

    const value = row[key];
    return typeof value === 'string' ? value.trim() : String(value).trim();
  }

  private readReviewStatus(value?: string) {
    if (
      value === ReviewStatus.Yes ||
      value === ReviewStatus.No ||
      value === ReviewStatus.NoNotesNeeded
    ) {
      return value;
    }

    return null;
  }

  private toSafeFileName(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private findDuplicateTitles(titles: string[]) {
    const seen = new Map<string, string>();
    const duplicates = new Set<string>();

    for (const title of titles) {
      const normalizedTitle = title.trim().toLowerCase();
      const existingTitle = seen.get(normalizedTitle);

      if (existingTitle) {
        duplicates.add(existingTitle);
        continue;
      }

      seen.set(normalizedTitle, title);
    }

    return [...duplicates];
  }
}

import { BadRequestException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { BookWorkflowStatus } from '../common/enums/book-workflow-status.enum';
import { ChapterGenerationStatus } from '../common/enums/chapter-generation-status.enum';
import { ReviewStatus } from '../common/enums/review-status.enum';
import { ExportService } from '../export/export.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { BooksService } from './books.service';
import { BookRecord } from './book.types';

const baseBook: BookRecord = {
  id: 'book-1',
  title: 'AI Team Playbooks',
  sourceFileName: 'input.xlsx',
  notesOnOutlineBefore: 'Make it practical.',
  outlineText: 'Outline',
  notesOnOutlineAfter: null,
  statusOutlineNotes: ReviewStatus.NoNotesNeeded,
  finalReviewNotesStatus: ReviewStatus.NoNotesNeeded,
  finalReviewNotes: null,
  workflowStatus: BookWorkflowStatus.OutlineReady,
  bookOutputStatus: 'not_ready',
  outputPdfPath: null,
  outputPdfFileName: null,
  chapters: [],
  events: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('BooksService', () => {
  let service: BooksService;
  let storageService: jest.Mocked<SupabaseStorageService>;
  let aiService: jest.Mocked<AiService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let exportService: jest.Mocked<ExportService>;

  beforeEach(() => {
    storageService = {
      listBooks: jest.fn().mockResolvedValue([]),
      getBook: jest.fn(),
      saveBook: jest.fn(),
      deleteBook: jest.fn(),
      uploadPdf: jest.fn(),
      downloadFile: jest.fn(),
      buildPdfObjectPath: jest.fn((bookId: string, fileName: string) =>
        `pdfs/${bookId}/${fileName}`,
      ),
    } as unknown as jest.Mocked<SupabaseStorageService>;

    aiService = {
      generateOutline: jest.fn(),
      generateChapter: jest.fn(),
    } as unknown as jest.Mocked<AiService>;

    notificationsService = {
      sendWorkflowEmail: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;

    exportService = {
      exportBookToPdf: jest.fn(),
    } as unknown as jest.Mocked<ExportService>;

    service = new BooksService(
      storageService,
      aiService,
      notificationsService,
      exportService,
    );
  });

  it('blocks outline generation when pre-outline notes are missing', async () => {
    storageService.getBook.mockResolvedValue({
      ...baseBook,
      notesOnOutlineBefore: '',
    });

    await expect(service.generateOutline('book-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('passes previous chapter summaries into chapter generation', async () => {
    storageService.getBook.mockResolvedValue({
      ...baseBook,
      chapters: [
        {
          id: 'chapter-1',
          bookId: 'book-1',
          chapterNumber: 1,
          title: 'Why this matters',
          outlineSummary: 'Context',
          content: 'Chapter 1',
          summary: 'Summary 1',
          chapterNotesStatus: ReviewStatus.NoNotesNeeded,
          chapterNotes: null,
          generationStatus: ChapterGenerationStatus.Approved,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'chapter-2',
          bookId: 'book-1',
          chapterNumber: 2,
          title: 'How to apply it',
          outlineSummary: 'Application',
          content: null,
          summary: null,
          chapterNotesStatus: null,
          chapterNotes: null,
          generationStatus: ChapterGenerationStatus.Pending,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    aiService.generateChapter.mockResolvedValue({
      content: 'Generated chapter',
      summary: 'Generated summary',
    });

    await service.generateChapter('book-1', 2);

    expect(aiService.generateChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        priorChapterSummaries: ['Summary 1'],
      }),
    );
    expect(storageService.saveBook).toHaveBeenCalled();
  });

  it('compiles a PDF when final review is approved', async () => {
    storageService.getBook.mockResolvedValue({
      ...baseBook,
      chapters: [
        {
          id: 'chapter-1',
          bookId: 'book-1',
          chapterNumber: 1,
          title: 'Why this matters',
          outlineSummary: 'Context',
          content: 'Chapter 1',
          summary: 'Summary 1',
          chapterNotesStatus: ReviewStatus.NoNotesNeeded,
          chapterNotes: null,
          generationStatus: ChapterGenerationStatus.Approved,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    exportService.exportBookToPdf.mockResolvedValue(Buffer.from('pdf'));

    await service.compileBook('book-1');

    expect(exportService.exportBookToPdf).toHaveBeenCalled();
    expect(storageService.uploadPdf).toHaveBeenCalledWith(
      'pdfs/book-1/ai-team-playbooks.pdf',
      Buffer.from('pdf'),
    );
    expect(storageService.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        bookOutputStatus: 'ready',
        outputPdfPath: 'pdfs/book-1/ai-team-playbooks.pdf',
      }),
    );
  });

  it('deletes a book and its uploaded PDF when present', async () => {
    storageService.getBook.mockResolvedValue({
      ...baseBook,
      outputPdfPath: 'pdfs/book-1/ai-team-playbooks.pdf',
    });

    await expect(service.deleteBook('book-1')).resolves.toEqual({
      deleted: true,
      id: 'book-1',
      title: 'AI Team Playbooks',
    });

    expect(storageService.deleteBook).toHaveBeenCalledWith('book-1', [
      'pdfs/book-1/ai-team-playbooks.pdf',
    ]);
  });

  it('rejects imports when the uploaded file contains duplicate titles', async () => {
    const file = {
      originalname: 'books.csv',
      buffer: Buffer.from(
        'title,notes_on_outline_before\nBook One,Notes\nbook one,More notes\n',
      ),
    };

    await expect(service.importBooksFromFile(file)).rejects.toThrow(
      'This file contains duplicate title(s): Book One. Please keep each title unique.',
    );
    expect(storageService.saveBook).not.toHaveBeenCalled();
  });

  it('rejects imports when a title already exists in storage', async () => {
    const file = {
      originalname: 'books.csv',
      buffer: Buffer.from(
        'title,notes_on_outline_before\nBook One,Notes\nBook Two,More notes\n',
      ),
    };
    storageService.listBooks.mockResolvedValueOnce([
      {
        ...baseBook,
        id: 'book-2',
        title: 'Book Two',
      },
    ]);

    await expect(service.importBooksFromFile(file)).rejects.toThrow(
      'These title(s) already exist: Book Two. Please remove them from the file or rename them.',
    );
    expect(storageService.saveBook).not.toHaveBeenCalled();
  });
});

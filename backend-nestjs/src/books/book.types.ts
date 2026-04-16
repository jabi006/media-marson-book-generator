import { BookWorkflowStatus } from '../common/enums/book-workflow-status.enum';
import { ChapterGenerationStatus } from '../common/enums/chapter-generation-status.enum';
import { ReviewStatus } from '../common/enums/review-status.enum';

export interface WorkflowEventRecord {
  id: string;
  chapterId: string | null;
  createdAt: string;
  message: string;
  type: string;
}

export interface ChapterRecord {
  id: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  outlineSummary: string | null;
  content: string | null;
  summary: string | null;
  chapterNotesStatus: ReviewStatus | null;
  chapterNotes: string | null;
  generationStatus: ChapterGenerationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BookRecord {
  id: string;
  title: string;
  sourceFileName: string | null;
  numberOfChapters: number | null;
  notesOnOutlineBefore: string;
  outlineText: string | null;
  notesOnOutlineAfter: string | null;
  statusOutlineNotes: ReviewStatus | null;
  finalReviewNotesStatus: ReviewStatus | null;
  finalReviewNotes: string | null;
  workflowStatus: BookWorkflowStatus;
  bookOutputStatus: string;
  outputPdfPath: string | null;
  outputPdfFileName: string | null;
  chapters: ChapterRecord[];
  events: WorkflowEventRecord[];
  createdAt: string;
  updatedAt: string;
}

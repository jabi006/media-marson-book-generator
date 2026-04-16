export type ReviewStatus = 'yes' | 'no' | 'no_notes_needed' | null;

export interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  outlineSummary: string | null;
  content: string | null;
  summary: string | null;
  chapterNotesStatus: ReviewStatus;
  chapterNotes: string | null;
  generationStatus: string;
}

export interface WorkflowEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  sourceFileName: string | null;
  notesOnOutlineBefore: string;
  outlineText: string | null;
  notesOnOutlineAfter: string | null;
  statusOutlineNotes: ReviewStatus;
  finalReviewNotesStatus: ReviewStatus;
  finalReviewNotes: string | null;
  workflowStatus: string;
  bookOutputStatus: string;
  outputPdfPath: string | null;
  chapters: Chapter[];
  events: WorkflowEvent[];
  updatedAt: string;
}

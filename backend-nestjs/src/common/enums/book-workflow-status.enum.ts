export enum BookWorkflowStatus {
  Imported = 'imported',
  OutlineReady = 'outline_ready',
  WaitingOutlineNotes = 'waiting_outline_notes',
  OutlinePaused = 'outline_paused',
  ChapterReady = 'chapter_ready',
  WaitingChapterNotes = 'waiting_chapter_notes',
  ChapterPaused = 'chapter_paused',
  ReadyForFinalReview = 'ready_for_final_review',
  FinalPaused = 'final_paused',
  Completed = 'completed',
  Error = 'error',
}

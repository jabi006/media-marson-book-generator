export interface OutlineChapterPlan {
  number: number;
  title: string;
  description: string;
}

export interface OutlineGenerationResult {
  outlineText: string;
  chapters: OutlineChapterPlan[];
}

export interface ChapterGenerationResult {
  content: string;
  summary: string;
}

import { useEffect, useState } from 'react';
import { Chapter } from '../lib/types';
import { formatReviewStatus } from '../lib/utils';
import { StatusBadge } from './status-badge';

interface ChapterCardProps {
  chapter: Chapter;
  disabled?: boolean;
  onGenerate: (chapterNumber: number) => Promise<void>;
  onSaveReview: (
    chapterNumber: number,
    payload: { chapterNotesStatus: string; chapterNotes: string },
  ) => Promise<void>;
}

export function ChapterCard({
  chapter,
  disabled = false,
  onGenerate,
  onSaveReview,
}: ChapterCardProps) {
  const [chapterNotes, setChapterNotes] = useState(chapter.chapterNotes ?? '');
  const [chapterNotesStatus, setChapterNotesStatus] = useState<string>(
    chapter.chapterNotesStatus ?? 'no',
  );

  useEffect(() => {
    setChapterNotes(chapter.chapterNotes ?? '');
    setChapterNotesStatus(chapter.chapterNotesStatus ?? 'no');
  }, [chapter.chapterNotes, chapter.chapterNotesStatus, chapter.id]);

  return (
    <article className="chapter-card">
      <div className="chapter-card__header">
        <div>
          <p className="eyebrow">Chapter {chapter.chapterNumber}</p>
          <h3>{chapter.title}</h3>
        </div>
        <StatusBadge
          label={formatReviewStatus(chapter.generationStatus)}
          tone={chapter.content ? 'success' : 'warning'}
        />
      </div>

      <p className="muted-text">{chapter.outlineSummary ?? 'No chapter brief yet.'}</p>

      <div className="chapter-card__actions">
        <button
          className="button button--secondary"
          disabled={disabled}
          onClick={() => onGenerate(chapter.chapterNumber)}
          type="button"
        >
          {chapter.content ? 'Regenerate chapter' : 'Generate chapter'}
        </button>
      </div>

      <label className="field">
        <span>Chapter Notes Status</span>
        <select
          disabled={disabled}
          value={chapterNotesStatus}
          onChange={(event) => setChapterNotesStatus(event.target.value)}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="no_notes_needed">No Notes Needed</option>
        </select>
      </label>

      <label className="field">
        <span>Chapter Notes</span>
        <textarea
          disabled={disabled}
          rows={4}
          value={chapterNotes}
          onChange={(event) => setChapterNotes(event.target.value)}
          placeholder="Add chapter-specific review notes here."
        />
      </label>

      <button
        className="button"
        disabled={disabled}
        onClick={() =>
          onSaveReview(chapter.chapterNumber, {
            chapterNotesStatus,
            chapterNotes,
          })
        }
        type="button"
      >
        Save chapter review
      </button>

      <div className="chapter-card__body">
        <div>
          <h4>Content</h4>
          <pre>{chapter.content ?? 'Generate this chapter to see the draft.'}</pre>
        </div>
        <div>
          <h4>Summary For Next Chapters</h4>
          <p>{chapter.summary ?? 'Summary will be stored here after generation.'}</p>
        </div>
      </div>
    </article>
  );
}

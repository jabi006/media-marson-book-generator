import { Book } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(extractApiErrorMessage(body));
  }

  return response.json() as Promise<T>;
}

function extractApiErrorMessage(body: unknown) {
  if (!body || typeof body !== 'object') {
    return 'Something went wrong. Please try again.';
  }

  const record = body as Record<string, unknown>;
  const message = record.message;

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (Array.isArray(message)) {
    const readableMessages = message.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );

    if (readableMessages.length > 0) {
      return readableMessages.join(' ');
    }
  }

  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error;
  }

  return 'Something went wrong. Please try again.';
}

export async function fetchBooks() {
  const response = await fetch(`${API_BASE_URL}/books`);
  return parseResponse<Book[]>(response);
}

export async function deleteBook(bookId: string) {
  const response = await fetch(`${API_BASE_URL}/books/${bookId}`, {
    method: 'DELETE',
  });

  return parseResponse<{ deleted: boolean; id: string; title: string }>(response);
}

export async function uploadSpreadsheet(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/books/import`, {
    method: 'POST',
    body: formData,
  });

  return parseResponse<{ importedCount: number; books: Book[] }>(response);
}

export async function generateOutline(bookId: string) {
  const response = await fetch(`${API_BASE_URL}/books/${bookId}/generate-outline`, {
    method: 'POST',
  });

  return parseResponse<Book>(response);
}

export async function updateOutlineReview(
  bookId: string,
  payload: { statusOutlineNotes: string; notesOnOutlineAfter: string },
) {
  const response = await fetch(`${API_BASE_URL}/books/${bookId}/outline-review`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<Book>(response);
}

export async function generateChapter(bookId: string, chapterNumber: number) {
  const response = await fetch(
    `${API_BASE_URL}/books/${bookId}/chapters/${chapterNumber}/generate`,
    {
      method: 'POST',
    },
  );

  return parseResponse<Book>(response);
}

export async function updateChapterReview(
  bookId: string,
  chapterNumber: number,
  payload: { chapterNotesStatus: string; chapterNotes: string },
) {
  const response = await fetch(
    `${API_BASE_URL}/books/${bookId}/chapters/${chapterNumber}/review`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  return parseResponse<Book>(response);
}

export async function updateFinalReview(
  bookId: string,
  payload: { finalReviewNotesStatus: string; finalReviewNotes: string },
) {
  const response = await fetch(`${API_BASE_URL}/books/${bookId}/final-review`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<Book>(response);
}

export async function compileBook(bookId: string) {
  const response = await fetch(`${API_BASE_URL}/books/${bookId}/compile`, {
    method: 'POST',
  });

  return parseResponse<Book>(response);
}

export async function downloadBook(bookId: string, title: string) {
  const response = await fetch(`${API_BASE_URL}/books/${bookId}/download`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(extractApiErrorMessage(body));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

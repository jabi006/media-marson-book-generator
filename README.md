# Automated Book Generator

Monorepo with:

- `backend-nestjs`: NestJS API, AI generation flow, PDF compilation, Supabase Storage persistence
- `frontend-react`: React dashboard with a My Books view, detail workspace, and PDF download flow

## Storage Model

This app now uses Supabase Storage only.

- Book records are saved as JSON files in the configured bucket
- Compiled PDFs are uploaded to the same bucket
- No database is required for runtime

## Required Environment

Set these values before running the app:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `VITE_API_BASE_URL`

AI and notification keys are still optional/used as configured:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `CLAUDE_API_KEY`
- `RESEND_API_KEY`

## Local Run

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

Frontend:

- `http://localhost:5173`

Backend:

- `http://localhost:3000`

## Docker

```bash
docker compose up --build
```

The compose file runs only the frontend and backend. Supabase is expected to be your external storage backend.

## Workflow

1. Create one book or import many from CSV/XLSX
2. Generate and review the outline
3. Generate and review chapters sequentially
4. Save final review
5. Compile the PDF
6. Download the PDF from the dashboard or detail page

## Sample Input

- [samples/books-input.csv](/d:/media-marson-book-generator/samples/books-input.csv)

## Verification

Verified locally:

- `npm run build`
- `npm run test`

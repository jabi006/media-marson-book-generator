import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'node:stream';
import { BookRecord, ChapterRecord } from '../books/book.types';

@Injectable()
export class ExportService {
  async exportBookToPdf(
    book: Pick<BookRecord, 'title'>,
    chapters: ChapterRecord[],
    finalReviewNotes?: string | null,
  ) {
    const document = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: book.title,
        Author: 'Automated Book Generation System',
      },
    });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    const pdfReady = new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      document.on('error', reject);
    });

    document.pipe(stream);

    document.fontSize(24).text(book.title, { align: 'center' });
    document.moveDown();
    document
      .fontSize(11)
      .fillColor('#555555')
      .text('Generated with staged review, chapter context chaining, and PDF compilation.');

    if (finalReviewNotes) {
      document.moveDown();
      document
        .fillColor('#111111')
        .fontSize(12)
        .text(`Final review notes: ${finalReviewNotes}`);
    }

    chapters.forEach((chapter) => {
      document.addPage();
      document
        .fillColor('#111111')
        .fontSize(20)
        .text(`${chapter.chapterNumber}. ${chapter.title}`);
      document.moveDown();
      document.fontSize(12).text(chapter.content ?? 'Chapter content missing.');

      if (chapter.summary) {
        document.moveDown();
        document.fillColor('#555555').fontSize(10).text(`Summary: ${chapter.summary}`);
      }
    });

    document.end();

    return pdfReady;
  }
}

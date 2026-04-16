import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BookRecord } from '../books/book.types';

interface BookIndexDocument {
  bookIds: string[];
}

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly indexPath = 'meta/book-index.json';
  private client: SupabaseClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  async listBooks() {
    const bookIds = await this.readBookIndex();
    const books = await Promise.all(
      bookIds.map(async (bookId) => this.getBook(bookId)),
    );

    return books
      .filter((book): book is BookRecord => Boolean(book))
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
  }

  async getBook(bookId: string) {
    return this.downloadJson<BookRecord>(this.getBookPath(bookId));
  }

  async saveBook(book: BookRecord) {
    await this.uploadJson(this.getBookPath(book.id), book);

    const bookIds = await this.readBookIndex();
    if (!bookIds.includes(book.id)) {
      await this.writeBookIndex([...bookIds, book.id]);
    }
  }

  async deleteBook(bookId: string, extraPaths: string[] = []) {
    const bookIds = await this.readBookIndex();
    await this.writeBookIndex(bookIds.filter((currentId) => currentId !== bookId));

    const objectsToDelete = [this.getBookPath(bookId), ...extraPaths].filter(
      (value): value is string => Boolean(value),
    );

    if (objectsToDelete.length > 0) {
      await this.removeObjects(objectsToDelete);
    }
  }

  async uploadPdf(objectPath: string, buffer: Buffer) {
    const { error } = await this.getBucket().upload(objectPath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (error) {
      throw new InternalServerErrorException(
        `Supabase Storage upload failed: ${error.message}`,
      );
    }
  }

  async downloadFile(objectPath: string) {
    const { data, error } = await this.getBucket().download(objectPath);

    if (error) {
      throw new InternalServerErrorException(
        `Supabase Storage download failed: ${error.message}`,
      );
    }

    return Buffer.from(await data.arrayBuffer());
  }

  buildPdfObjectPath(bookId: string, fileName: string) {
    return `pdfs/${bookId}/${fileName}`;
  }

  private getBookPath(bookId: string) {
    return `books/${bookId}.json`;
  }

  private async readBookIndex() {
    const document = await this.downloadJson<BookIndexDocument>(this.indexPath);
    return document?.bookIds ?? [];
  }

  private async writeBookIndex(bookIds: string[]) {
    const uniqueIds = [...new Set(bookIds)];
    await this.uploadJson(this.indexPath, { bookIds: uniqueIds });
  }

  private async uploadJson(path: string, value: unknown) {
    const buffer = Buffer.from(JSON.stringify(value, null, 2));
    const { error } = await this.getBucket().upload(path, buffer, {
      contentType: 'application/json; charset=utf-8',
      upsert: true,
    });

    if (error) {
      throw new InternalServerErrorException(
        `Supabase Storage upload failed: ${error.message}`,
      );
    }
  }

  private async downloadJson<T>(path: string) {
    const { data, error } = await this.getBucket().download(path);

    if (error) {
      if (this.isMissingObjectError(error)) {
        return null;
      }

      throw new InternalServerErrorException(
        `Supabase Storage download failed: ${error.message}`,
      );
    }

    const text = await data.text();
    return JSON.parse(text) as T;
  }

  private async removeObjects(paths: string[]) {
    const { error } = await this.getBucket().remove(paths);

    if (error) {
      throw new InternalServerErrorException(
        `Supabase Storage delete failed: ${error.message}`,
      );
    }
  }

  private getBucket() {
    return this.getClient().storage.from(this.getBucketName());
  }

  private getBucketName() {
    return this.configService.get<string>('app.supabaseBucket') ?? 'books';
  }

  private getClient() {
    if (this.client) {
      return this.client;
    }

    const supabaseUrl = this.configService.get<string>('app.supabaseUrl');
    const supabaseSecretKey = this.configService.get<string>(
      'app.supabaseSecretKey',
    );

    if (!supabaseUrl || !supabaseSecretKey) {
      this.logger.error(
        'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.',
      );
      throw new InternalServerErrorException(
        'Supabase Storage is not configured. Please add SUPABASE_URL and SUPABASE_SECRET_KEY.',
      );
    }

    this.client = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return this.client;
  }

  private isMissingObjectError(error: { message?: string; statusCode?: string }) {
    return (
      error.statusCode === '404' ||
      error.message?.toLowerCase().includes('not found') === true
    );
  }
}

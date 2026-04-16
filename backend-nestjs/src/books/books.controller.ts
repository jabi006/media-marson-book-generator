import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { BooksService } from './books.service';
import { UpdateChapterReviewDto } from './dto/update-chapter-review.dto';
import { UpdateFinalReviewDto } from './dto/update-final-review.dto';
import { UpdateOutlineReviewDto } from './dto/update-outline-review.dto';

interface UploadedSpreadsheetFile {
  buffer: Buffer;
  originalname: string;
}

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  listBooks() {
    return this.booksService.listBooks();
  }

  @Get(':id')
  getBook(@Param('id') id: string) {
    return this.booksService.getBook(id);
  }

  @Delete(':id')
  deleteBook(@Param('id') id: string) {
    return this.booksService.deleteBook(id);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importBooks(@UploadedFile() file: UploadedSpreadsheetFile | undefined) {
    return this.booksService.importBooksFromFile(file);
  }

  @Post(':id/generate-outline')
  generateOutline(@Param('id') id: string) {
    return this.booksService.generateOutline(id);
  }

  @Patch(':id/outline-review')
  updateOutlineReview(
    @Param('id') id: string,
    @Body() dto: UpdateOutlineReviewDto,
  ) {
    return this.booksService.updateOutlineReview(id, dto);
  }

  @Post(':id/chapters/:chapterNumber/generate')
  generateChapter(
    @Param('id') id: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
  ) {
    return this.booksService.generateChapter(id, chapterNumber);
  }

  @Patch(':id/chapters/:chapterNumber/review')
  updateChapterReview(
    @Param('id') id: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
    @Body() dto: UpdateChapterReviewDto,
  ) {
    return this.booksService.updateChapterReview(id, chapterNumber, dto);
  }

  @Patch(':id/final-review')
  updateFinalReview(
    @Param('id') id: string,
    @Body() dto: UpdateFinalReviewDto,
  ) {
    return this.booksService.updateFinalReview(id, dto);
  }

  @Post(':id/compile')
  compileBook(@Param('id') id: string) {
    return this.booksService.compileBook(id);
  }

  @Get(':id/download')
  async downloadBook(@Param('id') id: string, @Res() response: Response) {
    const file = await this.booksService.getPdfFile(id);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return response.send(file.buffer);
  }
}

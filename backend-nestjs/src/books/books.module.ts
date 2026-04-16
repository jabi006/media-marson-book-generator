import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ExportModule } from '../export/export.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

@Module({
  imports: [AiModule, NotificationsModule, ExportModule, StorageModule],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}

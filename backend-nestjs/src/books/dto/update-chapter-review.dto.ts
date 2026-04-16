import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReviewStatus } from '../../common/enums/review-status.enum';

export class UpdateChapterReviewDto {
  @IsOptional()
  @IsString()
  chapterNotes?: string;

  @IsOptional()
  @IsEnum(ReviewStatus)
  chapterNotesStatus?: ReviewStatus;
}

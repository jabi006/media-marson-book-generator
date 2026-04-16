import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReviewStatus } from '../../common/enums/review-status.enum';

export class UpdateFinalReviewDto {
  @IsOptional()
  @IsString()
  finalReviewNotes?: string;

  @IsOptional()
  @IsEnum(ReviewStatus)
  finalReviewNotesStatus?: ReviewStatus;
}

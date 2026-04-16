import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReviewStatus } from '../../common/enums/review-status.enum';

export class UpdateOutlineReviewDto {
  @IsOptional()
  @IsString()
  notesOnOutlineAfter?: string;

  @IsOptional()
  @IsEnum(ReviewStatus)
  statusOutlineNotes?: ReviewStatus;
}

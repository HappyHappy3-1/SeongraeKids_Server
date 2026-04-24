import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateNoticeDto {
  @ApiProperty({ example: '4월 현장학습 안내' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: '2026년 4월 28일 체험학습을 실시합니다.' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ example: '2026-04-28', nullable: true })
  @IsOptional()
  @IsDateString()
  event_date?: string | null;
}

export class UpdateNoticeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: '2026-04-28', nullable: true })
  @IsOptional()
  @IsDateString()
  event_date?: string | null;
}

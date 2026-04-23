import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ClosePollDto {
  @ApiPropertyOptional({
    example: true,
    description: 'true면 즉시 마감, false면 다시 오픈',
  })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

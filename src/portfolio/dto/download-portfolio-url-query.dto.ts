import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DownloadPortfolioUrlQueryDto {
  @ApiPropertyOptional({
    description: 'Signed URL expiration time in seconds',
    example: 300,
    default: 300,
    minimum: 60,
    maximum: 3600,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  expiresIn?: number;
}

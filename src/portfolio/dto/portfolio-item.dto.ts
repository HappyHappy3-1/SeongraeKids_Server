import { ApiProperty } from '@nestjs/swagger';

export class PortfolioItemDto {
  @ApiProperty({ example: '22719bae-7155-40a8-af6e-971f803de84b' })
  id!: string;

  @ApiProperty({ example: 'd92a7f12-4a86-4fa0-8dc4-f6ee5fe5eef0' })
  studentId!: string;

  @ApiProperty({ example: 'portfolio-math.pdf' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 524288 })
  size!: number;

  @ApiProperty({ example: '2026-04-23T09:12:34.000Z' })
  uploadedAt!: string;
}

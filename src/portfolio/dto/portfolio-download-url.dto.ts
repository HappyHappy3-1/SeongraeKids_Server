import { ApiProperty } from '@nestjs/swagger';

export class PortfolioDownloadUrlDto {
  @ApiProperty({
    example:
      'https://project-id.supabase.co/storage/v1/object/sign/portfolios/student-id/file.pdf?token=...',
  })
  url!: string;

  @ApiProperty({ example: 300 })
  expiresIn!: number;
}

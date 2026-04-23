import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePollDto {
  @ApiProperty({ example: '오늘 간식 투표' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: '2026-05-01',
    description: '현재 polls 테이블에서는 사용하지 않는 호환용 필드입니다.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    example: ['김밥', '샌드위치', '과일컵'],
    type: [String],
    minItems: 2,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  options: string[];

  @ApiPropertyOptional({
    example: '2026-04-30T15:00:00.000Z',
    description: '현재 polls 테이블에서는 사용하지 않는 호환용 필드입니다.',
  })
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'true면 복수 선택을 허용합니다.',
  })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'true면 익명 투표로 생성합니다.',
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiPropertyOptional({
    example: 'b2360106-14c8-44d8-b392-808c9a2ea52c',
    description: '투표 생성자 프로필 ID. 없으면 서버 기본값을 사용합니다.',
  })
  @IsOptional()
  @IsUUID()
  createdBy?: string;
}

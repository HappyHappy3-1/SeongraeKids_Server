import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRecruitmentDto {
  @ApiProperty({ example: 'SK 하이닉스' })
  @IsString()
  @MinLength(1)
  company_name!: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  headcount!: number;

  @ApiProperty({ example: '경기도 이천시' })
  @IsString()
  @MinLength(1)
  location!: string;

  @ApiPropertyOptional({ example: 'https://classroom.google.com/...' })
  @IsOptional()
  @IsString()
  classroom_link?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  military_service_available?: boolean;
}

export class UpdateRecruitmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() company_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) headcount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() classroom_link?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() military_service_available?: boolean;
}

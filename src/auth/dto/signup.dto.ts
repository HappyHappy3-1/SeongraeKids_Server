import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export type SupabaseRole =
  | 'student'
  | 'teacher'
  | 'president'
  | 'vice_president'
  | 'admin';

export const SUPABASE_ROLES: SupabaseRole[] = [
  'student',
  'teacher',
  'president',
  'vice_president',
  'admin',
];

export class SignUpDto {
  @ApiProperty({ example: 'user@e-mirim.hs.kr', format: 'email' })
  @IsEmail()
  @Matches(/@e-mirim\.hs\.kr$/i, {
    message: '미림마이스터고 이메일(@e-mirim.hs.kr)로만 가입 가능합니다.',
  })
  email!: string;

  @ApiProperty({ example: 'secret123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: SUPABASE_ROLES, example: 'student' })
  @IsOptional()
  @IsIn(SUPABASE_ROLES)
  role?: SupabaseRole;
}

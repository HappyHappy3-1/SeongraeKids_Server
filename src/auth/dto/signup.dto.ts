import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export type SupabaseRole = 'student' | 'teacher' | 'homeroom_teacher';

export const SUPABASE_ROLES: SupabaseRole[] = [
  'student',
  'teacher',
  'homeroom_teacher',
];

export class SignUpDto {
  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @IsEmail()
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

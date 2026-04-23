import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SUPABASE_ROLES, type SupabaseRole } from './signup.dto';

export class SetRoleDto {
  @ApiProperty({ enum: SUPABASE_ROLES, example: 'student' })
  @IsIn(SUPABASE_ROLES)
  role!: SupabaseRole;
}

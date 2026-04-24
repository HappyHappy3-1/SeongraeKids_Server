import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SUPABASE_ROLES, type SupabaseRole } from '../../auth/dto/signup.dto';

export class UpdateProfileRoleDto {
  @ApiProperty({ enum: SUPABASE_ROLES, example: 'president' })
  @IsIn(SUPABASE_ROLES)
  role!: SupabaseRole;
}

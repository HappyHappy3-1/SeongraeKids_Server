import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { SupabaseRole } from '../auth/dto/signup.dto';

export interface ProfileRow {
  id: string;
  school_email: string;
  name: string;
  role: SupabaseRole;
  created_at: string;
  updated_at: string;
}

const STAFF_ROLES = new Set<SupabaseRole>([
  'teacher',
  'admin',
  'president',
  'vice_president',
]);

const TEACHER_ROLES = new Set<SupabaseRole>(['teacher', 'admin']);

@Injectable()
export class ProfilesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getMe(accessToken: string, userId: string): Promise<ProfileRow> {
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error || !data) {
      throw new NotFoundException(
        `Profile not found for current user: ${error?.message ?? ''}`,
      );
    }
    return data as ProfileRow;
  }

  async listStudents(accessToken: string, requesterId: string): Promise<ProfileRow[]> {
    const me = await this.getMe(accessToken, requesterId);
    if (!TEACHER_ROLES.has(me.role)) {
      throw new ForbiddenException(
        'Only teachers or admins can list students.',
      );
    }
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .in('role', ['student', 'president', 'vice_president'])
      .order('name', { ascending: true });
    if (error) {
      throw new BadRequestException(`Failed to list students: ${error.message}`);
    }
    return (data ?? []) as ProfileRow[];
  }

  async getById(
    accessToken: string,
    requesterId: string,
    targetId: string,
  ): Promise<ProfileRow> {
    const me = await this.getMe(accessToken, requesterId);
    if (requesterId !== targetId && !STAFF_ROLES.has(me.role)) {
      throw new ForbiddenException();
    }
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .single();
    if (error || !data) {
      throw new NotFoundException(
        `Profile not found: ${error?.message ?? ''}`,
      );
    }
    return data as ProfileRow;
  }

  async updateRole(
    accessToken: string,
    requesterId: string,
    targetId: string,
    role: SupabaseRole,
  ): Promise<ProfileRow> {
    const me = await this.getMe(accessToken, requesterId);
    if (!TEACHER_ROLES.has(me.role)) {
      throw new ForbiddenException('Only teachers or admins can change roles.');
    }
    if (!this.supabaseService.hasServiceRoleKey) {
      throw new BadRequestException(
        'SUPABASE_SERVICE_ROLE_KEY required to mutate profiles.role.',
      );
    }
    const admin = this.supabaseService.createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', targetId)
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(
        `Failed to update role: ${error?.message ?? 'unknown'}`,
      );
    }
    return data as ProfileRow;
  }
}

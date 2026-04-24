import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CreateRecruitmentDto,
  UpdateRecruitmentDto,
} from './dto/recruitment.dto';

export interface RecruitmentRow {
  id: string;
  company_name: string;
  headcount: number;
  location: string;
  classroom_link: string | null;
  military_service_available: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class RecruitmentService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(accessToken: string): Promise<RecruitmentRow[]> {
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client
      .from('recruitment_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      throw new BadRequestException(
        `Failed to list recruitment posts: ${error.message}`,
      );
    }
    return (data ?? []) as RecruitmentRow[];
  }

  async create(
    accessToken: string,
    authorId: string,
    dto: CreateRecruitmentDto,
  ): Promise<RecruitmentRow> {
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client
      .from('recruitment_posts')
      .insert({
        company_name: dto.company_name.trim(),
        headcount: dto.headcount,
        location: dto.location.trim(),
        classroom_link: dto.classroom_link?.trim() || null,
        military_service_available: dto.military_service_available ?? false,
        created_by: authorId,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(
        `Failed to create recruitment post: ${error?.message ?? 'unknown'}`,
      );
    }
    return data as RecruitmentRow;
  }

  async update(
    accessToken: string,
    id: string,
    dto: UpdateRecruitmentDto,
  ): Promise<RecruitmentRow> {
    const client = this.supabaseService.createUserClient(accessToken);
    const patch: Record<string, unknown> = {};
    for (const key of [
      'company_name',
      'headcount',
      'location',
      'classroom_link',
      'military_service_available',
    ] as const) {
      const value = dto[key];
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No fields to update.');
    }
    const { data, error } = await client
      .from('recruitment_posts')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) {
      throw new NotFoundException(
        `Failed to update recruitment post: ${error?.message ?? 'not found'}`,
      );
    }
    return data as RecruitmentRow;
  }

  async remove(accessToken: string, id: string): Promise<{ ok: true }> {
    const client = this.supabaseService.createUserClient(accessToken);
    const { error } = await client
      .from('recruitment_posts')
      .delete()
      .eq('id', id);
    if (error) {
      throw new BadRequestException(
        `Failed to delete recruitment post: ${error.message}`,
      );
    }
    return { ok: true };
  }
}

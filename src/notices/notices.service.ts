import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

export interface NoticeRow {
  id: string;
  title: string;
  content: string;
  created_by: string;
  published_at: string;
  updated_at: string;
  event_date: string | null;
}

@Injectable()
export class NoticesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(accessToken: string): Promise<NoticeRow[]> {
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client
      .from('notices')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) {
      throw new BadRequestException(`Failed to list notices: ${error.message}`);
    }
    return (data ?? []) as NoticeRow[];
  }

  async create(
    accessToken: string,
    authorId: string,
    dto: CreateNoticeDto,
  ): Promise<NoticeRow> {
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client
      .from('notices')
      .insert({
        title: dto.title.trim(),
        content: dto.content.trim(),
        created_by: authorId,
        event_date: dto.event_date ?? null,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(
        `Failed to create notice: ${error?.message ?? 'unknown'}`,
      );
    }
    return data as NoticeRow;
  }

  async update(
    accessToken: string,
    id: string,
    dto: UpdateNoticeDto,
  ): Promise<NoticeRow> {
    const client = this.supabaseService.createUserClient(accessToken);
    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.content !== undefined) patch.content = dto.content.trim();
    if (dto.event_date !== undefined) patch.event_date = dto.event_date ?? null;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No fields to update.');
    }
    const { data, error } = await client
      .from('notices')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) {
      throw new NotFoundException(
        `Failed to update notice: ${error?.message ?? 'not found'}`,
      );
    }
    return data as NoticeRow;
  }

  async remove(accessToken: string, id: string): Promise<{ ok: true }> {
    const client = this.supabaseService.createUserClient(accessToken);
    const { error } = await client.from('notices').delete().eq('id', id);
    if (error) {
      throw new BadRequestException(
        `Failed to delete notice: ${error.message}`,
      );
    }
    return { ok: true };
  }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

export interface GoogleCourseWork {
  courseId: string;
  id: string;
  title: string;
  description?: string;
  alternateLink?: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
  state?: string;
  creationTime?: string;
}

export interface ParsedJob {
  id: string;
  courseId: string;
  title: string;
  companyName: string;
  headcount: number;
  location: string;
  classroomLink: string;
  military: boolean;
  deadline: string | null;
  raw?: string;
}

const JOB_KEYWORD = /(채용|공고|공채|수시|모집|인턴|지원|업무|특채)/;

@Injectable()
export class ClassroomApiService {
  private readonly logger = new Logger(ClassroomApiService.name);
  private cachedToken: { token: string; exp: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async ensureAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.exp > Date.now() + 30_000) {
      return this.cachedToken.token;
    }
    const clientId = this.configService.get<string>(
      'GOOGLE_CLASSROOM_CLIENT_ID',
    );
    const clientSecret = this.configService.get<string>(
      'GOOGLE_CLASSROOM_CLIENT_SECRET',
    );
    const refreshToken = this.configService.get<string>(
      'GOOGLE_CLASSROOM_REFRESH_TOKEN',
    );
    if (!clientId || !clientSecret || !refreshToken) {
      throw new BadRequestException(
        'GOOGLE_CLASSROOM_CLIENT_ID/SECRET/REFRESH_TOKEN not configured.',
      );
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !payload.access_token) {
      throw new BadRequestException(
        `Google token refresh failed: ${payload.error_description ?? payload.error ?? 'unknown'}`,
      );
    }
    this.cachedToken = {
      token: payload.access_token,
      exp: Date.now() + (payload.expires_in ?? 3300) * 1000,
    };
    return payload.access_token;
  }

  async listCourses() {
    const token = await this.ensureAccessToken();
    const res = await fetch(
      'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=50',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = (await res.json()) as {
      courses?: Array<{ id: string; name: string; alternateLink?: string }>;
    };
    return body.courses ?? [];
  }

  async listCourseWork(courseId: string): Promise<GoogleCourseWork[]> {
    const token = await this.ensureAccessToken();
    const res = await fetch(
      `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(
        `Classroom API courseWork failed: ${res.status} ${err.slice(0, 200)}`,
      );
    }
    const body = (await res.json()) as { courseWork?: GoogleCourseWork[] };
    return body.courseWork ?? [];
  }

  private parseDescription(
    title: string,
    description: string | undefined,
    alternateLink: string | undefined,
    dueDate: GoogleCourseWork['dueDate'],
    courseId: string,
    id: string,
  ): ParsedJob | null {
    const desc = description ?? '';
    const pick = (re: RegExp) => {
      const m = desc.match(re);
      return m ? m[1].trim() : '';
    };
    const company =
      pick(/기업명[^:\n]*:\s*([^\n]+)/) ||
      title.replace(/\[[^\]]+\]/g, '').trim();
    if (!company) return null;
    const headcountRaw = pick(/채용인원[^:\n]*:\s*([^\n]+)/);
    const headcountMatch = headcountRaw.match(/\d+/);
    const headcount = headcountMatch ? Number(headcountMatch[0]) : 1;
    const location =
      pick(/주소[^:\n]*:\s*([^\n]+)/) ||
      pick(/회사\s*위치[^:\n]*:\s*([^\n]+)/) ||
      '미정';
    const militaryRaw = pick(/병역[^:\n]*:\s*([^\n]+)/);
    const military = /가능|특례|인정|신청|예정/.test(militaryRaw);
    let deadline: string | null = null;
    if (dueDate?.year && dueDate.month && dueDate.day) {
      deadline = `${dueDate.year}-${String(dueDate.month).padStart(2, '0')}-${String(dueDate.day).padStart(2, '0')}`;
    }
    return {
      id,
      courseId,
      title,
      companyName: company.slice(0, 120),
      headcount: headcount > 0 ? headcount : 1,
      location: location.slice(0, 160),
      classroomLink:
        alternateLink ||
        `https://classroom.google.com/c/${courseId}/a/${id}/details`,
      military,
      deadline,
      raw: desc,
    };
  }

  async syncCourseJobs(courseId: string) {
    const works = await this.listCourseWork(courseId);
    const jobs = works
      .filter(
        (w) =>
          (w.state ?? 'PUBLISHED') === 'PUBLISHED' &&
          (JOB_KEYWORD.test(w.title) || JOB_KEYWORD.test(w.description ?? '')),
      )
      .map((w) =>
        this.parseDescription(
          w.title,
          w.description,
          w.alternateLink,
          w.dueDate,
          w.courseId,
          w.id,
        ),
      )
      .filter((j): j is ParsedJob => j !== null);

    if (!this.supabaseService.hasServiceRoleKey) {
      return { fetched: works.length, parsed: jobs.length, upserted: 0, jobs };
    }
    const actorId = this.configService.get<string>(
      'CLASSROOM_SYNC_ACTOR_PROFILE_ID',
    );
    if (!actorId) {
      return {
        fetched: works.length,
        parsed: jobs.length,
        upserted: 0,
        warning:
          'CLASSROOM_SYNC_ACTOR_PROFILE_ID env not set — rows not persisted.',
        jobs,
      };
    }
    const admin = this.supabaseService.createAdminClient();
    let inserted = 0;
    let updated = 0;
    for (const job of jobs) {
      const payload = {
        company_name: job.companyName,
        headcount: job.headcount,
        location: job.location,
        classroom_link: job.classroomLink,
        military_service_available: job.military,
        created_by: actorId,
        deadline: job.deadline,
        description: job.raw ?? null,
      };
      const { data: existing } = await admin
        .from('recruitment_posts')
        .select('id')
        .eq('classroom_link', job.classroomLink)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await admin
          .from('recruitment_posts')
          .update(payload)
          .eq('id', existing.id);
        if (!error) updated += 1;
        else
          this.logger.warn(
            `update failed for ${job.id}: ${error.message}`,
          );
      } else {
        const { error } = await admin
          .from('recruitment_posts')
          .insert(payload);
        if (!error) inserted += 1;
        else
          this.logger.warn(
            `insert failed for ${job.id}: ${error.message}`,
          );
      }
    }
    return {
      fetched: works.length,
      parsed: jobs.length,
      inserted,
      updated,
      upserted: inserted + updated,
      jobs,
    };
  }
}

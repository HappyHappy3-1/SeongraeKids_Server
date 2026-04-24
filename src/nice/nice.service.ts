import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface NeisResponse<T> {
  [key: string]: Array<
    { head?: Array<{ list_total_count?: number; RESULT?: { CODE: string; MESSAGE: string } }> } | { row?: T[] }
  >;
}

export interface MealRow {
  MMEAL_SC_NM: string;
  MLSV_YMD: string;
  DDISH_NM: string;
  CAL_INFO?: string;
}

export interface TimetableRow {
  ALL_TI_YMD: string;
  PERIO: string;
  ITRT_CNTNT: string;
  CLASS_NM?: string;
  GRADE?: string;
  CLRM_NM?: string;
}

@Injectable()
export class NiceService {
  private readonly logger = new Logger(NiceService.name);
  private readonly apiKey: string | null;
  private readonly officeCode: string;
  private readonly schoolCode: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NEIS_API_KEY') ?? null;
    this.officeCode =
      this.configService.get<string>('NEIS_OFFICE_CODE') ?? 'B10';
    this.schoolCode =
      this.configService.get<string>('NEIS_SCHOOL_CODE') ?? '7010569';
  }

  private async request<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
    if (!this.apiKey) {
      this.logger.warn('NEIS_API_KEY not configured');
      return [];
    }
    const qs = new URLSearchParams({
      KEY: this.apiKey,
      Type: 'json',
      pIndex: '1',
      pSize: '100',
      ATPT_OFCDC_SC_CODE: this.officeCode,
      SD_SCHUL_CODE: this.schoolCode,
      ...params,
    });
    const url = `https://open.neis.go.kr/hub/${endpoint}?${qs}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`NEIS ${endpoint} HTTP ${res.status}`);
        return [];
      }
      const body = (await res.json()) as NeisResponse<T>;
      const key = Object.keys(body).find((k) => k === endpoint);
      if (!key) return [];
      const blocks = body[key];
      const rowBlock = blocks.find((b): b is { row?: T[] } => 'row' in b);
      return rowBlock?.row ?? [];
    } catch (e) {
      this.logger.warn(`NEIS ${endpoint} failed: ${(e as Error).message}`);
      return [];
    }
  }

  stripHtml(s?: string | null): string {
    if (!s) return '';
    return s
      .replace(/<br\s*\/?>(\s)*/gi, '\n')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/\([^)]*\)/g, '')
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private splitMealItems(raw?: string | null): string[] {
    const cleaned = this.stripHtml(raw);
    return cleaned
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async getMeals(date: string) {
    const rows = await this.request<MealRow>('mealServiceDietInfo', {
      MLSV_YMD: date,
    });
    const byType: Record<string, string[]> = { 조식: [], 중식: [], 석식: [] };
    for (const r of rows) {
      const type = r.MMEAL_SC_NM ?? '';
      if (!(type in byType)) continue;
      byType[type] = this.splitMealItems(r.DDISH_NM);
    }
    return {
      date,
      breakfast: byType['조식'],
      lunch: byType['중식'],
      dinner: byType['석식'],
    };
  }

  async getTimetable(date: string, grade: string, classNm: string) {
    const rows = await this.request<TimetableRow>('hisTimetable', {
      ALL_TI_YMD: date,
      GRADE: grade,
      CLASS_NM: classNm,
    });
    return rows
      .map((r) => ({
        period: Number(r.PERIO) || 0,
        subject: this.stripHtml(r.ITRT_CNTNT),
      }))
      .sort((a, b) => a.period - b.period);
  }
}

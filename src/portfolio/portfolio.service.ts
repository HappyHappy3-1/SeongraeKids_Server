import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import type { PortfolioItemDto } from './dto/portfolio-item.dto';

type PortfolioRow = {
  id: string;
  student_id: string;
  file_path: string;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_at?: string;
  created_at?: string;
};

type ProfileRoleRow = {
  role?: string | null;
};

type UploadedPdfFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

@Injectable()
export class PortfolioService {
  private readonly portfolioTable: string;
  private readonly profileTable: string;
  private readonly portfolioBucket: string;
  private readonly defaultSignedUrlExpiresIn: number;
  private readonly maxFileSizeBytes: number;
  private readonly teacherRoles = new Set(['teacher', 'homeroom_teacher']);
  private readonly studentRoles = new Set(['student']);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {
    this.portfolioTable =
      this.configService.get<string>('SUPABASE_PORTFOLIO_TABLE') ?? 'portfolios';
    this.profileTable =
      this.configService.get<string>('SUPABASE_PROFILE_TABLE') ?? 'profiles';
    this.portfolioBucket =
      this.configService.get<string>('SUPABASE_PORTFOLIO_BUCKET') ?? 'portfolios';
    this.defaultSignedUrlExpiresIn = this.getPositiveIntegerFromEnv(
      'PORTFOLIO_SIGNED_URL_EXPIRES_IN',
      300,
    );
    this.maxFileSizeBytes = this.getPositiveIntegerFromEnv(
      'PORTFOLIO_MAX_FILE_SIZE_BYTES',
      10 * 1024 * 1024,
    );
  }

  async uploadMyPortfolio(
    userId: string,
    accessToken: string,
    file: UploadedPdfFile | undefined,
  ): Promise<PortfolioItemDto> {
    this.validatePdfFile(file);

    const client = this.supabaseService.createUserClient(accessToken);
    const role = await this.getRoleForUser(client, userId);

    if (!this.studentRoles.has(role)) {
      throw new ForbiddenException('Only students can upload portfolio PDFs.');
    }

    const filePath = this.buildFilePath(userId);
    const { error: uploadError } = await client.storage
      .from(this.portfolioBucket)
      .upload(filePath, file.buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      throw new BadRequestException(
        `Failed to upload PDF file: ${uploadError.message}`,
      );
    }

    const { data, error } = await client
      .from(this.portfolioTable)
      .insert({
        student_id: userId,
        file_path: filePath,
        original_name: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
      })
      .select('*')
      .single();

    if (error || !data) {
      await client.storage.from(this.portfolioBucket).remove([filePath]);
      throw new BadRequestException(
        `Failed to save portfolio metadata: ${error?.message ?? 'Unknown error'}`,
      );
    }

    return this.toPortfolioItem(data as PortfolioRow);
  }

  async getMyPortfolios(
    userId: string,
    accessToken: string,
  ): Promise<PortfolioItemDto[]> {
    const client = this.supabaseService.createUserClient(accessToken);
    const role = await this.getRoleForUser(client, userId);

    if (!this.studentRoles.has(role)) {
      throw new ForbiddenException('Only students can view this endpoint.');
    }

    const { data, error } = await client
      .from(this.portfolioTable)
      .select('*')
      .eq('student_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      throw new BadRequestException(
        `Failed to fetch student portfolios: ${error.message}`,
      );
    }

    return (data ?? []).map((item) => this.toPortfolioItem(item as PortfolioRow));
  }

  async getAllPortfoliosForTeacher(
    userId: string,
    accessToken: string,
  ): Promise<PortfolioItemDto[]> {
    const client = this.supabaseService.createUserClient(accessToken);
    const role = await this.getRoleForUser(client, userId);

    if (!this.teacherRoles.has(role)) {
      throw new ForbiddenException(
        'Only teachers can view all student portfolios.',
      );
    }

    const { data, error } = await client
      .from(this.portfolioTable)
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) {
      throw new BadRequestException(
        `Failed to fetch class portfolios: ${error.message}`,
      );
    }

    return (data ?? []).map((item) => this.toPortfolioItem(item as PortfolioRow));
  }

  async getPortfolioDownloadUrl(
    userId: string,
    accessToken: string,
    portfolioId: string,
    expiresIn?: number,
  ): Promise<{ url: string; expiresIn: number }> {
    const client = this.supabaseService.createUserClient(accessToken);
    const role = await this.getRoleForUser(client, userId);

    if (!this.studentRoles.has(role) && !this.teacherRoles.has(role)) {
      throw new ForbiddenException('You do not have access to this endpoint.');
    }

    const { data, error } = await client
      .from(this.portfolioTable)
      .select('*')
      .eq('id', portfolioId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Portfolio file was not found.');
    }

    const portfolio = data as PortfolioRow;

    if (this.studentRoles.has(role) && portfolio.student_id !== userId) {
      throw new ForbiddenException('Students can only download their own files.');
    }

    const signedUrlExpiresIn = expiresIn ?? this.defaultSignedUrlExpiresIn;
    const { data: signedUrlData, error: signedUrlError } = await client.storage
      .from(this.portfolioBucket)
      .createSignedUrl(portfolio.file_path, signedUrlExpiresIn);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new BadRequestException(
        `Failed to create signed download URL: ${signedUrlError?.message ?? 'Unknown error'}`,
      );
    }

    return {
      url: signedUrlData.signedUrl,
      expiresIn: signedUrlExpiresIn,
    };
  }

  private async getRoleForUser(
    client: SupabaseClient,
    userId: string,
  ): Promise<string> {
    const { data: userData } = await client.auth.getUser();
    const metadataRole = (
      (userData?.user?.user_metadata as { role?: unknown } | null | undefined)
        ?.role ?? ''
    )
      .toString()
      .trim()
      .toLowerCase();

    if (metadataRole) {
      return metadataRole;
    }

    const { data, error } = await client
      .from(this.profileTable)
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new ForbiddenException(
        'Your role was not found. Please complete profile setup first.',
      );
    }

    const role = ((data as ProfileRoleRow).role ?? '').trim().toLowerCase();

    if (!role) {
      throw new ForbiddenException('Your role is missing.');
    }

    return role;
  }

  private validatePdfFile(file: UploadedPdfFile | undefined): asserts file {
    if (!file) {
      throw new BadRequestException('A PDF file is required.');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only application/pdf files are allowed.');
    }

    if (file.size <= 0) {
      throw new BadRequestException('Uploaded file is empty.');
    }

    if (file.size > this.maxFileSizeBytes) {
      throw new BadRequestException(
        `PDF file is too large. Max size is ${this.maxFileSizeBytes} bytes.`,
      );
    }
  }

  private buildFilePath(userId: string): string {
    const datePart = new Date().toISOString().slice(0, 10);
    return `student/${userId}/${datePart}/${randomUUID()}.pdf`;
  }

  private toPortfolioItem(row: PortfolioRow): PortfolioItemDto {
    return {
      id: row.id,
      studentId: row.student_id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      uploadedAt: row.uploaded_at ?? row.created_at ?? new Date().toISOString(),
    };
  }

  private getPositiveIntegerFromEnv(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const parsed = rawValue ? Number(rawValue) : fallback;

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto, type SupabaseRole } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  private async upsertProfile(
    userId: string,
    patch: { role?: SupabaseRole; name?: string; email?: string },
  ) {
    if (!this.supabaseService.hasServiceRoleKey) return;
    const admin = this.supabaseService.createAdminClient();

    // DB trigger `handle_new_user` already creates the profile row with
    // school_email on auth.users insert, so we only UPDATE role/name here.
    // Touching school_email risks `profiles_school_email_key` unique violations.
    const update: Record<string, unknown> = {};
    if (patch.role !== undefined) update.role = patch.role;
    if (patch.name !== undefined) update.name = patch.name;
    if (Object.keys(update).length === 0) return;

    const { error, data } = await admin
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .select('id')
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to update profile: ${error.message}`,
      );
    }
    if (!data) {
      // Fallback: trigger didn't fire — insert minimum row.
      const insertPayload: Record<string, unknown> = { id: userId, ...update };
      if (patch.email) {
        insertPayload.school_email = patch.email.toLowerCase().trim();
      }
      const { error: insertErr } = await admin
        .from('profiles')
        .insert(insertPayload);
      if (insertErr) {
        throw new BadRequestException(
          `Failed to insert profile: ${insertErr.message}`,
        );
      }
    }
  }

  async signUp(dto: SignUpDto) {
    const metadata: Record<string, unknown> = {};
    if (dto.name) metadata.name = dto.name;
    if (dto.role) metadata.role = dto.role;

    const { data, error } = await this.supabaseService.client.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: Object.keys(metadata).length > 0 ? metadata : undefined,
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (data.user?.id) {
      await this.upsertProfile(data.user.id, {
        role: dto.role ?? 'student',
        name: dto.name ?? dto.email.split('@')[0],
        email: dto.email,
      });
    }

    return {
      user: data.user,
      session: data.session,
      requiresEmailConfirm: Boolean(data.user && !data.session),
    };
  }

  async resendConfirmation(email: string) {
    const { error } = await this.supabaseService.client.auth.resend({
      type: 'signup',
      email,
    });
    if (error) {
      throw new BadRequestException(error.message);
    }
    return { ok: true };
  }

  async login(dto: LoginDto) {
    const { data, error } =
      await this.supabaseService.client.auth.signInWithPassword({
        email: dto.email,
        password: dto.password,
      });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      user: data.user,
      session: data.session,
    };
  }

  async refresh(refreshToken: string) {
    const { data, error } =
      await this.supabaseService.client.auth.refreshSession({
        refresh_token: refreshToken,
      });
    if (error || !data.session) {
      throw new BadRequestException(
        `Supabase refreshSession failed: ${error?.message ?? 'unknown'}`,
      );
    }
    return { session: data.session, user: data.user };
  }

  async setRole(accessToken: string, role: SupabaseRole) {
    const url =
      this.configService.get<string>('SUPABASE_URL') ??
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_URL');
    const anonKey =
      this.configService.get<string>('SUPABASE_ANON_KEY') ??
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    if (!url || !anonKey) {
      throw new BadRequestException('SUPABASE_URL/ANON_KEY not configured.');
    }

    const res = await fetch(`${url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ data: { role } }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      msg?: string;
      message?: string;
      error?: string;
      error_description?: string;
      user_metadata?: Record<string, unknown>;
      id?: string;
    };
    if (!res.ok) {
      const detail =
        body.msg ||
        body.message ||
        body.error_description ||
        body.error ||
        `HTTP ${res.status}`;
      throw new BadRequestException(
        `Supabase PUT /auth/v1/user failed: ${detail}`,
      );
    }

    if (body.id) {
      const meta =
        (body as { user_metadata?: { email?: string; name?: string } })
          .user_metadata ?? {};
      const email = (body as { email?: string }).email ?? meta.email;
      const name = meta.name ?? (email ? email.split('@')[0] : undefined);
      await this.upsertProfile(body.id, { role, email, name });
    }
    return { role, user: body };
  }
}

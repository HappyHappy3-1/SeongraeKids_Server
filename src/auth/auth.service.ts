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
    // school_email on auth.users insert. We only UPDATE role/name here —
    // never touch school_email (unique) and never re-INSERT.
    const update: Record<string, unknown> = {};
    if (patch.role !== undefined) update.role = patch.role;
    if (patch.name !== undefined) update.name = patch.name;
    if (Object.keys(update).length === 0) return;

    // Retry a few times in case the trigger's commit hasn't propagated to
    // PostgREST's read path yet (eventual consistency is rare but possible).
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await admin
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
      if (data) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    // Profile still missing — trigger likely rejected the row (e.g., email
    // validation). Don't crash signup; user can still use the app and
    // GET /profiles/me will 404 until DB state is fixed.
  }

  async signUp(dto: SignUpDto) {
    const metadata: Record<string, unknown> = {};
    if (dto.name) metadata.name = dto.name;
    if (dto.role) metadata.role = dto.role;

    // Create user pre-confirmed via admin API so we can return a session
    // immediately without routing through email verification.
    if (this.supabaseService.hasServiceRoleKey) {
      const admin = this.supabaseService.createAdminClient();
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: dto.email,
          password: dto.password,
          email_confirm: true,
          user_metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });
      if (createErr) {
        throw new BadRequestException(createErr.message);
      }
      if (created.user?.id) {
        await this.upsertProfile(created.user.id, {
          role: dto.role ?? 'student',
          name: dto.name ?? dto.email.split('@')[0],
          email: dto.email,
        });
      }
      const { data: signedIn, error: signInErr } =
        await this.supabaseService.client.auth.signInWithPassword({
          email: dto.email,
          password: dto.password,
        });
      if (signInErr) {
        throw new BadRequestException(signInErr.message);
      }
      return {
        user: signedIn.user ?? created.user,
        session: signedIn.session,
        requiresEmailConfirm: false,
      };
    }

    // Fallback when no service role key — relies on Supabase project settings.
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

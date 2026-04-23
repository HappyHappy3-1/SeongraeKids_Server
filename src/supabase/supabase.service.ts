import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.constants';

@Injectable()
export class SupabaseService {
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly configService: ConfigService,
  ) {
    const url =
      this.configService.get<string>('SUPABASE_URL') ??
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_URL');
    const anonKey =
      this.configService.get<string>('SUPABASE_ANON_KEY') ??
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

    if (!url || !anonKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY must be set. NEXT_PUBLIC_SUPABASE_* keys are also supported as fallback.',
      );
    }

    this.supabaseUrl = url;
    this.supabaseAnonKey = anonKey;
  }

  get client() {
    return this.supabase;
  }

  createUserClient(accessToken: string): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
}

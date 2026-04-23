import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_CLIENT,
} from './supabase.constants';
import { SupabaseAdminService } from './supabase-admin.service';
import { SupabaseService } from './supabase.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url =
          configService.get<string>('SUPABASE_URL') ??
          configService.get<string>('NEXT_PUBLIC_SUPABASE_URL');
        const apiKey = [
          configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
          configService.get<string>('SUPABASE_ANON_KEY'),
          configService.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
          configService.get<string>('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
        ].find((candidate) => isUsableSupabaseKey(candidate));

        if (!url || !apiKey) {
          throw new Error(
            'SUPABASE_URL and a Supabase API key must be set. SUPABASE_SERVICE_ROLE_KEY is preferred; NEXT_PUBLIC_SUPABASE_* keys are also supported as fallback.',
          );
        }

        try {
          new URL(url);
        } catch {
          throw new Error(`Invalid SUPABASE_URL: ${url}`);
        }

        return createClient(url, apiKey);
      },
    },
    {
      provide: SUPABASE_ADMIN_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url =
          configService.get<string>('SUPABASE_URL') ??
          configService.get<string>('NEXT_PUBLIC_SUPABASE_URL');
        const serviceRoleKey =
          configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
          configService.get<string>('SUPABASE_SERVICE_ROLE');
        const anonKey =
          configService.get<string>('SUPABASE_ANON_KEY') ??
          configService.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
          configService.get<string>('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

        if (!url || !anonKey) {
          throw new Error(
            'SUPABASE_URL and SUPABASE_ANON_KEY must be set. NEXT_PUBLIC_SUPABASE_* keys are also supported as fallback.',
          );
        }

        try {
          new URL(url);
        } catch {
          throw new Error(`Invalid SUPABASE_URL: ${url}`);
        }

        if (!serviceRoleKey) {
          Logger.warn(
            'SUPABASE_SERVICE_ROLE_KEY is not set. Classroom sync will fall back to the public anon key, which may fail if RLS blocks writes. Set the service role key for production sync.',
            SupabaseModule.name,
          );
          return createClient(url, anonKey);
        }

        return createClient(url, serviceRoleKey);
      },
    },
    SupabaseService,
    SupabaseAdminService,
  ],
  exports: [SUPABASE_CLIENT, SUPABASE_ADMIN_CLIENT, SupabaseService, SupabaseAdminService],
})
export class SupabaseModule {}

function isUsableSupabaseKey(value?: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return ![
    'your_supabase_service_role_key',
    'your_supabase_anon_key',
    'your_supabase_publishable_key',
  ].includes(normalized);
}

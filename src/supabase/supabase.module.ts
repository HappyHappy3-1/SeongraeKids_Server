import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.constants';
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

        return createClient(url, anonKey);
      },
    },
    SupabaseService,
  ],
  exports: [SUPABASE_CLIENT, SupabaseService],
})
export class SupabaseModule {}

import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';

@Module({
  imports: [SupabaseModule],
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}

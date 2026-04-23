import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../supabase/supabase.module';
import { ClassroomController } from './classroom.controller';
import { ClassroomSyncGuard } from './classroom-sync.guard';
import { ClassroomService } from './classroom.service';

@Module({
  imports: [ConfigModule, SupabaseModule],
  controllers: [ClassroomController],
  providers: [ClassroomService, ClassroomSyncGuard],
})
export class ClassroomModule {}

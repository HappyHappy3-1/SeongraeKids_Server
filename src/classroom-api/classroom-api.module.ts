import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClassroomApiController } from './classroom-api.controller';
import { ClassroomApiScheduler } from './classroom-api.scheduler';
import { ClassroomApiService } from './classroom-api.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [ClassroomApiController],
  providers: [ClassroomApiService, ClassroomApiScheduler],
  exports: [ClassroomApiService],
})
export class ClassroomApiModule {}

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClassroomSyncGuard } from './classroom-sync.guard';
import { ClassroomService } from './classroom.service';
import { SyncClassroomDto } from './dto/sync-classroom.dto';

@Controller('classroom')
@UseGuards(ClassroomSyncGuard)
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post('sync')
  sync(@Body() dto: SyncClassroomDto) {
    return this.classroomService.syncAll(dto.courseIds, dto.dryRun ?? false);
  }
}

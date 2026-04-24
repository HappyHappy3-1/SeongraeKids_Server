import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { ClassroomApiService } from './classroom-api.service';

@ApiTags('classroom-api')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('classroom-api')
export class ClassroomApiController {
  constructor(private readonly service: ClassroomApiService) {}

  @Get('courses')
  @ApiOperation({ summary: '내 구글 클래스룸 코스 목록' })
  listCourses() {
    return this.service.listCourses();
  }

  @Get('coursework/:courseId')
  @ApiOperation({ summary: '코스 과제 목록 (파싱 전)' })
  listCourseWork(@Param('courseId') courseId: string) {
    return this.service.listCourseWork(courseId);
  }

  @Post('sync-jobs/:courseId')
  @ApiOperation({
    summary:
      '코스의 과제들 중 채용 공고 포맷만 파싱해서 recruitment_posts에 upsert',
  })
  syncJobs(@Param('courseId') courseId: string) {
    return this.service.syncCourseJobs(courseId);
  }
}

import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { ClassroomCrawlerService } from './classroom-crawler.service';

@ApiTags('classroom-crawler')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('classroom-crawler')
export class ClassroomCrawlerController {
  constructor(private readonly service: ClassroomCrawlerService) {}

  @Post('login/interactive')
  @ApiOperation({
    summary:
      '헤드풀 Chromium을 열어 사용자가 직접 구글 로그인하게 한 뒤 쿠키를 저장한다.',
  })
  captureCookies() {
    return this.service.captureCookies();
  }

  @Post('login/auto')
  @ApiOperation({
    summary:
      'GOOGLE_EMAIL/GOOGLE_PASSWORD 로 자동 로그인 시도 (2FA/CAPTCHA 발동 시 실패).',
  })
  autoLogin() {
    return this.service.automatedLogin();
  }

  @Post('crawl/:courseId')
  @ApiOperation({ summary: '저장된 세션으로 Classroom 코스 스크레이핑' })
  crawl(@Param('courseId') courseId: string) {
    return this.service.crawlCourse(courseId);
  }

  @Get('status')
  @ApiOperation({ summary: '쿠키/설정 상태 점검' })
  async status() {
    return { ok: true };
  }

  @Get('debug/:courseId')
  debug(@Param('courseId') courseId: string) {
    return this.service.debugDump(courseId);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClassroomApiService } from './classroom-api.service';

@Injectable()
export class ClassroomApiScheduler {
  private readonly logger = new Logger(ClassroomApiScheduler.name);
  private readonly enabled: boolean;
  private readonly courseIds: string[];

  constructor(
    private readonly service: ClassroomApiService,
    private readonly configService: ConfigService,
  ) {
    const raw = this.configService.get<string>('CLASSROOM_SYNC_COURSE_IDS') ?? '';
    this.courseIds = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.enabled =
      this.courseIds.length > 0 &&
      this.configService.get<string>('CLASSROOM_SYNC_ENABLED') !== 'false';
    if (this.enabled) {
      this.logger.log(
        `Classroom sync scheduled every 10 min for courses: ${this.courseIds.join(', ')}`,
      );
    } else {
      this.logger.log(
        'Classroom sync scheduler idle (set CLASSROOM_SYNC_COURSE_IDS to enable).',
      );
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick() {
    if (!this.enabled) return;
    for (const courseId of this.courseIds) {
      try {
        const r = await this.service.syncCourseJobs(courseId);
        this.logger.log(
          `[${courseId}] fetched=${r.fetched} parsed=${r.parsed} inserted=${r.inserted ?? 0} updated=${r.updated ?? 0}`,
        );
      } catch (e) {
        this.logger.warn(
          `[${courseId}] sync failed: ${(e as Error).message}`,
        );
      }
    }
  }
}

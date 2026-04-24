import { Module } from '@nestjs/common';
import { ClassroomCrawlerController } from './classroom-crawler.controller';
import { ClassroomCrawlerService } from './classroom-crawler.service';

@Module({
  controllers: [ClassroomCrawlerController],
  providers: [ClassroomCrawlerService],
  exports: [ClassroomCrawlerService],
})
export class ClassroomCrawlerModule {}

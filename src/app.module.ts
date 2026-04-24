import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClassroomModule } from './classroom/classroom.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PollsModule } from './polls/polls.module';
import { ProfilesModule } from './profiles/profiles.module';
import { NoticesModule } from './notices/notices.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { NiceModule } from './nice/nice.module';
import { ClassroomCrawlerModule } from './classroom-crawler/classroom-crawler.module';
import { ClassroomApiModule } from './classroom-api/classroom-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AuthModule,
    PortfolioModule,
    ClassroomModule,
    PollsModule,
    ProfilesModule,
    NoticesModule,
    RecruitmentModule,
    NiceModule,
    ClassroomCrawlerModule,
    ClassroomApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClassroomModule } from './classroom/classroom.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PollsModule } from './polls/polls.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

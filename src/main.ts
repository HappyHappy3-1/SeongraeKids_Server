import { NestFactory } from '@nestjs/core';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';

@Catch()
class LoggingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const body = isHttp
      ? exception.getResponse()
      : { message: (exception as Error)?.message ?? 'Internal error' };
    this.logger.warn(
      `${req.method} ${req.originalUrl} -> ${status} ${JSON.stringify(body)}`,
    );
    res.status(status).json(body);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new LoggingExceptionFilter());
  app.enableCors({
    origin: [
      'https://seongraekids-client.hyphen.it.com',
      'https://seongraekidsclient.vercel.app',
      /^https:\/\/seongraekidsclient-[a-z0-9-]+\.vercel\.app$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SeongraeKids API')
    .setDescription('SeongraeKids backend API reference')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

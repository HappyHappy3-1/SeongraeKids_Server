import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClassroomSyncGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedSecret = this.configService.get<string>(
      'CLASSROOM_SYNC_SECRET',
    );

    if (!expectedSecret) {
      throw new UnauthorizedException(
        'CLASSROOM_SYNC_SECRET is not configured on the server.',
      );
    }

    const request = context.switchToHttp().getRequest();
    const providedHeader =
      request.headers['x-classroom-sync-secret'] ?? request.headers.authorization;
    const providedSecret = Array.isArray(providedHeader)
      ? providedHeader[0]
      : typeof providedHeader === 'string' && providedHeader.startsWith('Bearer ')
        ? providedHeader.slice('Bearer '.length).trim()
        : typeof providedHeader === 'string'
          ? providedHeader.trim()
          : '';

    if (providedSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid classroom sync secret.');
    }

    return true;
  }
}

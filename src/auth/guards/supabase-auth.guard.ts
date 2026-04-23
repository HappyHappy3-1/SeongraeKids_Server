import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required.');
    }

    const [scheme, accessToken] = authHeader.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !accessToken) {
      throw new UnauthorizedException(
        'Authorization header must use Bearer token format.',
      );
    }

    const { data, error } = await this.supabaseService
      .createUserClient(accessToken)
      .auth.getUser();

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    request.accessToken = accessToken;
    request.user = {
      id: data.user.id,
      email: data.user.email ?? null,
    };

    return true;
  }
}

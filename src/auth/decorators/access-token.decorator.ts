import {
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';

export const AccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.accessToken) {
      throw new UnauthorizedException(
        'Access token was not found in the request context.',
      );
    }

    return request.accessToken;
  },
);

import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  accessToken?: string;
}

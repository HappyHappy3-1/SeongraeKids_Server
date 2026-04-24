import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AccessToken } from './decorators/access-token.decorator';
import { LoginDto } from './dto/login.dto';
import { SetRoleDto } from './dto/set-role.dto';
import { SignUpDto } from './dto/signup.dto';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user via Supabase' })
  @ApiCreatedResponse({ description: 'Returns the created user and session.' })
  @ApiBadRequestResponse({ description: 'Invalid payload or Supabase error.' })
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Exchange refresh_token for a new session' })
  refresh(@Body() body: { refresh_token?: string }) {
    if (!body?.refresh_token) {
      return Promise.reject(new Error('refresh_token is required'));
    }
    return this.authService.refresh(body.refresh_token);
  }

  @Post('resend-confirmation')
  @ApiOperation({ summary: 'Resend email verification link' })
  resendConfirmation(@Body() body: { email?: string }) {
    if (!body?.email) {
      return Promise.reject(new Error('email is required'));
    }
    return this.authService.resendConfirmation(body.email);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email + password via Supabase' })
  @ApiOkResponse({ description: 'Returns the authenticated user and session.' })
  @ApiBadRequestResponse({ description: 'Invalid credentials or Supabase error.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('me/role')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set my role in user_metadata (student/teacher/homeroom_teacher)',
  })
  @ApiOkResponse({ description: 'Role persisted to user_metadata.' })
  @ApiBadRequestResponse({ description: 'Supabase error while updating user.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  setMyRole(@AccessToken() accessToken: string, @Body() dto: SetRoleDto) {
    return this.authService.setRole(accessToken, dto.role);
  }
}

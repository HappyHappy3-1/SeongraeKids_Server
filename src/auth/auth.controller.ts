import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';

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

  @Post('login')
  @ApiOperation({ summary: 'Login with email + password via Supabase' })
  @ApiOkResponse({ description: 'Returns the authenticated user and session.' })
  @ApiBadRequestResponse({ description: 'Invalid credentials or Supabase error.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}

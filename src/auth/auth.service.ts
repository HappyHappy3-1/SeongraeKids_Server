import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async signUp(dto: SignUpDto) {
    const { data, error } = await this.supabaseService.client.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: dto.name ? { name: dto.name } : undefined,
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      user: data.user,
      session: data.session,
    };
  }

  async login(dto: LoginDto) {
    const { data, error } =
      await this.supabaseService.client.auth.signInWithPassword({
        email: dto.email,
        password: dto.password,
      });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      user: data.user,
      session: data.session,
    };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto, type SupabaseRole } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async signUp(dto: SignUpDto) {
    const metadata: Record<string, unknown> = {};
    if (dto.name) metadata.name = dto.name;
    if (dto.role) metadata.role = dto.role;

    const { data, error } = await this.supabaseService.client.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: Object.keys(metadata).length > 0 ? metadata : undefined,
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

  async setRole(accessToken: string, role: SupabaseRole) {
    const client = this.supabaseService.createUserClient(accessToken);
    const { data, error } = await client.auth.updateUser({ data: { role } });
    if (error) {
      throw new BadRequestException(error.message);
    }
    return {
      role,
      user: data.user,
    };
  }
}

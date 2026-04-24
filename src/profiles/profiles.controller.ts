import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpdateProfileRoleDto } from './dto/update-role.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my full profile (id, email, name, role)' })
  @ApiOkResponse()
  getMe(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() token: string,
  ) {
    return this.profilesService.getMe(token, user.id);
  }

  @Get('students')
  @ApiOperation({
    summary: 'List all students (teacher/admin only). Includes president/vice_president.',
  })
  @ApiOkResponse()
  listStudents(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() token: string,
  ) {
    return this.profilesService.listStudents(token, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a profile by id (self or staff roles)' })
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() token: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.profilesService.getById(token, user.id, id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a profile role (teacher/admin only)' })
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() token: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProfileRoleDto,
  ) {
    return this.profilesService.updateRole(token, user.id, id, dto.role);
  }
}

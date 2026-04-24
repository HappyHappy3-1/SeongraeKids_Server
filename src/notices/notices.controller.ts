import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';
import { NoticesService } from './notices.service';

@ApiTags('notices')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  @ApiOperation({ summary: 'List all notices' })
  list(@AccessToken() token: string) {
    return this.noticesService.list(token);
  }

  @Post()
  @ApiOperation({ summary: 'Create notice (staff roles only via RLS)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() token: string,
    @Body() dto: CreateNoticeDto,
  ) {
    return this.noticesService.create(token, user.id, dto);
  }

  @Patch(':id')
  update(
    @AccessToken() token: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateNoticeDto,
  ) {
    return this.noticesService.update(token, id, dto);
  }

  @Delete(':id')
  remove(
    @AccessToken() token: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.noticesService.remove(token, id);
  }
}

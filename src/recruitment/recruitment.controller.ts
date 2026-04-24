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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateRecruitmentDto,
  UpdateRecruitmentDto,
} from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('recruitment')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('recruitment-posts')
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @ApiOperation({ summary: 'List all recruitment posts' })
  list(@AccessToken() token: string) {
    return this.recruitmentService.list(token);
  }

  @Post()
  @ApiOperation({ summary: 'Create recruitment post (teacher/admin via RLS)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() token: string,
    @Body() dto: CreateRecruitmentDto,
  ) {
    return this.recruitmentService.create(token, user.id, dto);
  }

  @Patch(':id')
  update(
    @AccessToken() token: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRecruitmentDto,
  ) {
    return this.recruitmentService.update(token, id, dto);
  }

  @Delete(':id')
  remove(
    @AccessToken() token: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.recruitmentService.remove(token, id);
  }
}

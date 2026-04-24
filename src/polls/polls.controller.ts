import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ClosePollDto } from './dto/close-poll.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { PollsService } from './polls.service';

@ApiTags('polls')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('polls')
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post()
  @ApiOperation({ summary: '투표 생성' })
  @ApiCreatedResponse({ description: '생성된 투표와 선택지, 현재 집계를 반환합니다.' })
  @ApiBadRequestResponse({ description: '입력값이 잘못되었거나 DB 저장에 실패했습니다.' })
  createPoll(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePollDto,
  ) {
    return this.pollsService.createPoll({ ...dto, createdBy: dto.createdBy ?? user.id });
  }

  @Get()
  @ApiOperation({ summary: '투표 목록 조회' })
  @ApiOkResponse({ description: '전체 투표 목록과 현재 집계를 반환합니다.' })
  getPolls() {
    return this.pollsService.listPolls();
  }

  @Get(':pollId')
  @ApiOperation({ summary: '투표 상세 조회' })
  @ApiParam({ name: 'pollId', description: '투표 ID' })
  @ApiOkResponse({ description: '단일 투표 상세와 현재 집계를 반환합니다.' })
  @ApiNotFoundResponse({ description: '투표를 찾을 수 없습니다.' })
  getPoll(@Param('pollId') pollId: string) {
    return this.pollsService.getPollById(pollId);
  }

  @Post(':pollId/vote')
  @ApiOperation({ summary: '투표 또는 기존 투표 변경' })
  @ApiParam({ name: 'pollId', description: '투표 ID' })
  @ApiOkResponse({ description: '투표 반영 후 최신 집계를 반환합니다.' })
  @ApiBadRequestResponse({ description: '마감된 투표이거나 잘못된 선택지입니다.' })
  @ApiNotFoundResponse({ description: '투표를 찾을 수 없습니다.' })
  vote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pollId') pollId: string,
    @Body() dto: VotePollDto,
  ) {
    return this.pollsService.vote(pollId, { ...dto, voterId: user.id });
  }

  @Patch(':pollId/close')
  @ApiOperation({ summary: '투표 마감 또는 재오픈' })
  @ApiParam({ name: 'pollId', description: '투표 ID' })
  @ApiOkResponse({ description: '상태 반영 후 최신 투표 정보를 반환합니다.' })
  @ApiNotFoundResponse({ description: '투표를 찾을 수 없습니다.' })
  closePoll(@Param('pollId') pollId: string, @Body() dto: ClosePollDto) {
    return this.pollsService.closePoll(pollId, dto);
  }
}

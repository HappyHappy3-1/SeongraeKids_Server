import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { ClosePollDto } from './dto/close-poll.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';

type PollRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  allow_multiple?: boolean | null;
  is_anonymous?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
};

type PollOptionRow = {
  id: string;
  poll_id: string;
  option_text: string;
  sort_order: number;
};

type PollVoteRow = {
  id: string;
  poll_id: string;
  voter_user_id: string;
  created_at: string;
};

@Injectable()
export class PollsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async createPoll(dto: CreatePollDto) {
    const optionContents = this.normalizeOptions(dto.options);
    const createdBy =
      dto.createdBy ?? this.configService.get<string>('CLASSROOM_SYNC_ACTOR_PROFILE_ID');

    if (!createdBy) {
      throw new BadRequestException(
        'createdBy is required because the polls table requires created_by',
      );
    }

    const poll = await this.insertPoll({
      title: dto.title.trim(),
      allow_multiple: dto.allowMultiple ?? false,
      is_anonymous: dto.isAnonymous ?? false,
      created_by: createdBy,
    });

    const { error: optionsError } = await this.supabaseService.client
      .from('poll_options')
      .insert(
        optionContents.map((optionText, index) => ({
          poll_id: poll.id,
          option_text: optionText,
          sort_order: index,
        })),
      );

    if (optionsError) {
      throw new BadRequestException(
        optionsError.message ?? 'Failed to create poll options',
      );
    }

    return this.getPollById(poll.id);
  }

  async listPolls() {
    const { data: polls, error } = await this.supabaseService.client
      .from('polls')
      .select()
      .order('created_at', { ascending: false })
      .returns<PollRow[]>();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.buildPollSummaries(polls ?? []);
  }

  async getPollById(pollId: string) {
    const { data: poll, error } = await this.supabaseService.client
      .from('polls')
      .select()
      .eq('id', pollId)
      .single<PollRow>();

    if (error || !poll) {
      throw new NotFoundException('Poll not found');
    }

    const [options, votes] = await Promise.all([
      this.getOptions([pollId]),
      this.getVotes([pollId]),
    ]);

    return this.serializePoll(poll, options, votes);
  }

  async vote(pollId: string, dto: VotePollDto) {
    const poll = await this.getRawPoll(pollId);
    this.ensurePollIsOpen(poll);

    const options = await this.getOptions([pollId]);
    const option = options.find((item) => item.id === dto.optionId);

    if (!option) {
      throw new BadRequestException('Selected option does not belong to this poll');
    }

    const { error } = await this.supabaseService.client.from('poll_votes').upsert(
      {
        poll_id: pollId,
        voter_user_id: dto.voterId,
      },
      {
        onConflict: 'poll_id,voter_user_id',
      },
    );

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.getPollById(pollId);
  }

  async closePoll(pollId: string, dto: ClosePollDto) {
    await this.getRawPoll(pollId);

    await this.updatePollStatus(pollId, dto.isClosed ?? true);

    return this.getPollById(pollId);
  }

  private async getRawPoll(pollId: string) {
    const { data: poll, error } = await this.supabaseService.client
      .from('polls')
      .select()
      .eq('id', pollId)
      .single<PollRow>();

    if (error || !poll) {
      throw new NotFoundException('Poll not found');
    }

    return poll;
  }

  private async buildPollSummaries(polls: PollRow[]) {
    const pollIds = polls.map((poll) => poll.id);
    const [options, votes] = await Promise.all([
      this.getOptions(pollIds),
      this.getVotes(pollIds),
    ]);

    return polls.map((poll) => this.serializePoll(poll, options, votes));
  }

  private async getOptions(pollIds: string[]) {
    if (pollIds.length === 0) {
      return [] as PollOptionRow[];
    }

    const { data, error } = await this.supabaseService.client
      .from('poll_options')
      .select('id, poll_id, option_text, sort_order')
      .in('poll_id', pollIds)
      .order('sort_order', { ascending: true })
      .returns<PollOptionRow[]>();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ?? [];
  }

  private async getVotes(pollIds: string[]) {
    if (pollIds.length === 0) {
      return [] as PollVoteRow[];
    }

    const { data, error } = await this.supabaseService.client
      .from('poll_votes')
      .select('id, poll_id, voter_user_id, created_at')
      .in('poll_id', pollIds)
      .returns<PollVoteRow[]>();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ?? [];
  }

  private serializePoll(
    poll: PollRow,
    options: PollOptionRow[],
    votes: PollVoteRow[],
  ) {
    const pollOptions = options.filter((option) => option.poll_id === poll.id);
    const pollVotes = votes.filter((vote) => vote.poll_id === poll.id);

    return {
      id: poll.id,
      title: poll.title ?? 'Untitled poll',
      date: null,
      status: poll.status ?? 'open',
      isClosed: this.isPollClosed(poll),
      closesAt: null,
      createdAt: poll.created_at ?? null,
      allowMultiple: poll.allow_multiple ?? false,
      isAnonymous: poll.is_anonymous ?? false,
      createdBy: poll.created_by ?? null,
      totalVoters: new Set(pollVotes.map((vote) => vote.voter_user_id)).size,
      options: pollOptions.map((option) => ({
        id: option.id,
        content: option.option_text,
        sortOrder: option.sort_order,
        voteCount: null,
        voters: [],
      })),
    };
  }

  private ensurePollIsOpen(poll: PollRow) {
    if (this.isPollClosed(poll)) {
      throw new BadRequestException('Poll is closed');
    }
  }

  private isPollClosed(poll: PollRow) {
    return ['closed', 'ended', 'completed', 'inactive', 'archived'].includes(
      (poll.status ?? '').toLowerCase(),
    );
  }

  private async insertPoll(payload: Record<string, string | boolean>) {
    const nextPayload = { ...payload };

    while (true) {
      const { data, error } = await this.supabaseService.client
        .from('polls')
        .insert(nextPayload)
        .select()
        .single<PollRow>();

      if (!error && data) {
        return data;
      }

      const missingColumn = this.getMissingPollColumn(error?.message);
      if (!missingColumn || !(missingColumn in nextPayload)) {
        throw new BadRequestException(error?.message ?? 'Failed to create poll');
      }

      delete nextPayload[missingColumn];
    }
  }

  private getMissingPollColumn(message?: string) {
    if (!message) {
      return null;
    }

    const match = message.match(
      /Could not find the '([^']+)' column of 'polls' in the schema cache/,
    );

    return match?.[1] ?? null;
  }

  private normalizeOptions(options: string[]) {
    const normalized = options
      .map((option) => option.trim())
      .filter((option) => option.length > 0);

    if (normalized.length < 2) {
      throw new BadRequestException('At least 2 non-empty options are required');
    }

    if (normalized.length > 10) {
      throw new BadRequestException('A poll can have at most 10 options');
    }

    const uniqueCount = new Set(normalized).size;
    if (uniqueCount !== normalized.length) {
      throw new BadRequestException('Duplicate options are not allowed');
    }

    return normalized;
  }

  private async updatePollStatus(pollId: string, isClosed: boolean) {
    const statusCandidates = isClosed
      ? ['closed', 'ended', 'completed', 'inactive', 'archived']
      : ['open', 'active', 'published', 'ongoing', 'draft'];

    let lastError: string | null = null;

    for (const status of statusCandidates) {
      const { error } = await this.supabaseService.client
        .from('polls')
        .update({ status })
        .eq('id', pollId);

      if (!error) {
        return;
      }

      lastError = error.message;
      if (!this.isInvalidPollStatusError(error.message)) {
        throw new BadRequestException(error.message);
      }
    }

    throw new BadRequestException(lastError ?? 'Failed to update poll status');
  }

  private isInvalidPollStatusError(message?: string) {
    return Boolean(message?.includes('invalid input value for enum poll_status'));
  }
}

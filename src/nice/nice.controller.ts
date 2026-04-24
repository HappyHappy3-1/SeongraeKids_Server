import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { NiceService } from './nice.service';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

@ApiTags('nice')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('nice')
export class NiceController {
  constructor(private readonly niceService: NiceService) {}

  @Get('meals')
  @ApiOperation({ summary: '나이스 급식 조식/중식/석식 조회' })
  async getMeals(@Query('date') date?: string) {
    return this.niceService.getMeals(date ?? today());
  }

  @Get('timetable')
  @ApiOperation({ summary: '나이스 시간표 조회 (학년·반 지정)' })
  async getTimetable(
    @Query('date') date?: string,
    @Query('grade') grade = '3',
    @Query('classNm') classNm = '1',
  ) {
    return this.niceService.getTimetable(date ?? today(), grade, classNm);
  }
}

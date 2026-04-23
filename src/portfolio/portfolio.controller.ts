import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DownloadPortfolioUrlQueryDto } from './dto/download-portfolio-url-query.dto';
import { PortfolioDownloadUrlDto } from './dto/portfolio-download-url.dto';
import { PortfolioItemDto } from './dto/portfolio-item.dto';
import { PortfolioService } from './portfolio.service';

type UploadedPdfFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

@ApiTags('portfolio')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('me')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload my portfolio PDF (student only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: PortfolioItemDto })
  @ApiBadRequestResponse({ description: 'Invalid file or metadata save failed.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Only students can upload files.' })
  uploadMyPortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() accessToken: string,
    @UploadedFile() file: UploadedPdfFile | undefined,
  ) {
    return this.portfolioService.uploadMyPortfolio(user.id, accessToken, file);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my portfolio list (student only)' })
  @ApiOkResponse({ type: PortfolioItemDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Only students can access this endpoint.' })
  getMyPortfolios(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() accessToken: string,
  ) {
    return this.portfolioService.getMyPortfolios(user.id, accessToken);
  }

  @Get()
  @ApiOperation({ summary: 'Get all student portfolios (teacher only)' })
  @ApiOkResponse({ type: PortfolioItemDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Only teachers can access this endpoint.' })
  getAllPortfolios(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() accessToken: string,
  ) {
    return this.portfolioService.getAllPortfoliosForTeacher(user.id, accessToken);
  }

  @Get(':portfolioId/download-url')
  @ApiOperation({
    summary:
      'Create a signed download URL for a portfolio PDF (student own file or teacher any file)',
  })
  @ApiParam({
    name: 'portfolioId',
    description: 'Portfolio row id',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({ type: PortfolioDownloadUrlDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({
    description: 'Students can only download their own files.',
  })
  @ApiBadRequestResponse({ description: 'Signed URL generation failed.' })
  getPortfolioDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @AccessToken() accessToken: string,
    @Param('portfolioId', new ParseUUIDPipe()) portfolioId: string,
    @Query() query: DownloadPortfolioUrlQueryDto,
  ) {
    return this.portfolioService.getPortfolioDownloadUrl(
      user.id,
      accessToken,
      portfolioId,
      query.expiresIn,
    );
  }
}

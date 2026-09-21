import { createZodDto } from 'nestjs-zod';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  extractionCreateSchema,
  extractionSaveSchema,
  extractionSaveReceiptSchema,
  extractionLatestSavedSchema,
  extractionJobSchema,
  extractionJobsSchema,
  extractionResultsSchema,
} from '@flex-thia/contracts/vocabulary-extraction/vocabulary-extraction';
import type {
  ExtractionRepository,
  ExtractionJob,
} from '@flex-thia/domain/vocabulary-extraction/extraction';
import type { UploadRepository } from '@flex-thia/domain/uploads/upload.repository';
import { extractionConfig } from '@flex-thia/providers/vocabulary-extraction/multimodal-extraction.ai';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
export const EXTRACTION_OPTIONS = Symbol('EXTRACTION_OPTIONS');
export type ExtractionOptions = {
  repository: ExtractionRepository;
  uploads: UploadRepository;
  env: Record<string, string | undefined>;
};
function publicJob(job: ExtractionJob) {
  return extractionJobSchema.parse({
    ...job,
    provider: job.config.provider,
    model: job.config.model,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}
class ExtractionSaveDto extends createZodDto(extractionSaveSchema) {}
class ExtractionSaveReceiptDto extends createZodDto(
  extractionSaveReceiptSchema,
) {}
class ExtractionLatestSavedDto extends createZodDto(
  extractionLatestSavedSchema.unwrap(),
) {}
class ExtractionCreateDto extends createZodDto(extractionCreateSchema) {}
class ExtractionJobDto extends createZodDto(extractionJobSchema) {}
class ExtractionJobsDto extends createZodDto(extractionJobsSchema) {}
class ExtractionResultsDto extends createZodDto(extractionResultsSchema) {}
@ApiTags('Admin Vocabulary Extraction')
@ApiBearerAuth('accessToken')
@Controller('admin/vocabulary-extraction/jobs')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class ExtractionController {
  constructor(
    @Inject(EXTRACTION_OPTIONS) private readonly options: ExtractionOptions,
  ) {}
  @Post()
  @ApiBody({ type: ExtractionCreateDto })
  @ApiCreatedResponse({ type: ExtractionJobDto })
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = extractionCreateSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ code: 'EXTRACTION_INPUT_INVALID' });
    const input = parsed.data;
    let config;
    try {
      config = extractionConfig(this.options.env);
    } catch {
      throw new ServiceUnavailableException({
        code: 'AI_NOT_CONFIGURED',
        detail: 'AI 제공사·모델·API 키를 서버에 설정하세요.',
      });
    }
    let source;
    if (input.source.kind !== 'url') {
      const [upload] = await this.options.uploads.findVerifiedOwnedByIds(
        user.userId,
        [input.source.uploadId],
      );
      if (
        !upload ||
        upload.inputType !== (input.source.kind === 'pdf' ? 'PDF' : 'IMAGE')
      )
        throw new BadRequestException({ code: 'EXTRACTION_UPLOAD_INVALID' });
      if (input.source.kind === 'image' && upload.sizeBytes > 5 * 1024 * 1024)
        throw new BadRequestException({ code: 'SOURCE_IMAGE_TOO_LARGE' });
      source = {
        kind: input.source.kind,
        inputKey: upload.inputKey,
        sizeBytes: upload.sizeBytes,
        uploadId: upload.uploadId,
      };
    } else source = input.source;
    try {
      return publicJob(
        await this.options.repository.create({
          ownerId: user.userId,
          requestId: input.requestId,
          requestHash: createHash('sha256')
            .update(JSON.stringify(input))
            .digest('hex'),
          sourceName: input.sourceName,
          source,
          prompt: input.prompt,
          config,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'EXTRACTION_REQUEST_CONFLICT'
      )
        throw new ConflictException({ code: error.message });
      throw error;
    }
  }
  @Get()
  @ApiOkResponse({ type: ExtractionJobsDto })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return {
      items: (await this.options.repository.list(user.userId)).map(publicJob),
    };
  }
  @Get('latest-saved')
  @ApiOkResponse({ type: ExtractionLatestSavedDto })
  latestSaved() {
    return this.options.repository.latestSaved();
  }
  @Get(':id')
  @ApiOkResponse({ type: ExtractionJobDto })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return publicJob(await this.owned(id, user.userId));
  }
  @Get(':id/results')
  @ApiOkResponse({ type: ExtractionResultsDto })
  async results(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const job = await this.owned(id, user.userId);
    if (job.status !== 'complete')
      throw new ConflictException({ code: 'EXTRACTION_NOT_COMPLETE' });
    return this.options.repository.review(id);
  }
  @Post(':id/save')
  @ApiBody({ type: ExtractionSaveDto })
  @ApiCreatedResponse({ type: ExtractionSaveReceiptDto })
  async save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = extractionSaveSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ code: 'EXTRACTION_SELECTION_INVALID' });
    await this.owned(id, user.userId);
    try {
      return await this.options.repository.save(
        id,
        user.userId,
        parsed.data.selectedIds,
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('EXTRACTION_'))
        throw new ConflictException({ code: error.message });
      throw error;
    }
  }
  @Post(':id/retry')
  @ApiCreatedResponse({ type: ExtractionJobDto })
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.owned(id, user.userId);
    await this.options.repository.retry(id, user.userId);
    return publicJob(await this.owned(id, user.userId));
  }
  private async owned(id: string, owner: string) {
    const job = await this.options.repository.get(id, owner);
    if (!job) throw new NotFoundException({ code: 'EXTRACTION_NOT_FOUND' });
    return job;
  }
}

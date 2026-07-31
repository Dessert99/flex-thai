/** ADMIN+MFA AI 어휘 후보 조회·승인·폐기 HTTP 경계를 제공한다 */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  vocabularyCandidateApproveRequestSchema,
  vocabularyCandidateApproveResponseSchema,
  vocabularyCandidateDetailResponseSchema,
  vocabularyCandidateDiscardRequestSchema,
  vocabularyCandidateDiscardResponseSchema,
  vocabularyCandidateListQuerySchema,
  vocabularyCandidateListResponseSchema,
  vocabularyCandidatePathSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import { ProblemDetailsDto } from '../openapi/openapi.dto.js';
import { VocabularyCandidateApplicationService } from './vocabulary-candidates.service.js';

/** 후보 목록 query Swagger DTO */
export class VocabularyCandidateListQueryDto extends createZodDto(
  vocabularyCandidateListQuerySchema,
) {}

/** 후보 목록 응답 Swagger DTO */
export class VocabularyCandidateListResponseDto extends createZodDto(
  vocabularyCandidateListResponseSchema,
) {}

/** 후보 상세 응답 Swagger DTO */
export class VocabularyCandidateDetailResponseDto extends createZodDto(
  vocabularyCandidateDetailResponseSchema,
) {}

const VocabularyCandidateApproveRequestDtoBase = createZodDto(
  vocabularyCandidateApproveRequestSchema,
) as unknown as new () => Record<string, unknown>;

/** 후보 승인 요청 Swagger DTO */
export class VocabularyCandidateApproveRequestDto extends VocabularyCandidateApproveRequestDtoBase {}

/** 후보 승인 응답 Swagger DTO */
export class VocabularyCandidateApproveResponseDto extends createZodDto(
  vocabularyCandidateApproveResponseSchema,
) {}

/** 후보 폐기 요청 Swagger DTO */
export class VocabularyCandidateDiscardRequestDto extends createZodDto(
  vocabularyCandidateDiscardRequestSchema,
) {}

/** 후보 폐기 응답 Swagger DTO */
export class VocabularyCandidateDiscardResponseDto extends createZodDto(
  vocabularyCandidateDiscardResponseSchema,
) {}

const actorContext = (user: AuthenticatedUser) => ({
  userId: user.userId,
  sub: user.sub,
});

const readErrorCode = (error: unknown): string | null =>
  error !== null &&
  typeof error === 'object' &&
  'code' in error &&
  typeof error.code === 'string'
    ? error.code
    : null;

const executeVocabularyCandidateOperation = async <Result>(
  operation: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await operation();
  } catch (error) {
    const code = readErrorCode(error);
    if (
      code === 'VOCABULARY_CANDIDATE_NOT_FOUND' ||
      code === 'VOCABULARY_CANDIDATE_EXISTING_VOCABULARY_NOT_FOUND'
    ) {
      throw new NotFoundException({ code });
    }
    if (
      code === 'VOCABULARY_CANDIDATE_NOT_APPROVABLE' ||
      code === 'VOCABULARY_CANDIDATE_DUPLICATE_CONFIRMATION_REQUIRED' ||
      code === 'VOCABULARY_CANDIDATE_AUDIO_NOT_READY'
    ) {
      throw new BadRequestException({ code });
    }
    if (
      code === 'VOCABULARY_CANDIDATE_IDEMPOTENCY_CONFLICT' ||
      code === 'VOCABULARY_CANDIDATE_REVIEW_CONFLICT'
    ) {
      throw new ConflictException({ code });
    }
    throw error;
  }
};

/** ADMIN과 TOTP 등록을 요구하는 AI 어휘 후보 endpoint */
@ApiTags('Admin Vocabulary Candidates')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  VocabularyCandidateListQueryDto,
  VocabularyCandidateListResponseDto,
  VocabularyCandidateDetailResponseDto,
  VocabularyCandidateApproveRequestDto,
  VocabularyCandidateApproveResponseDto,
  VocabularyCandidateDiscardRequestDto,
  VocabularyCandidateDiscardResponseDto,
)
@Controller('admin/content-production/vocabulary-candidates')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class VocabularyCandidateController {
  constructor(
    private readonly candidates: VocabularyCandidateApplicationService,
  ) {}

  /** 상태와 job filter로 후보 summary page를 조회한다 */
  @ApiOperation({ summary: 'AI 어휘 후보 목록을 조회한다' })
  @ApiQuery({ type: VocabularyCandidateListQueryDto })
  @ApiOkResponse({ type: VocabularyCandidateListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get()
  list(@Query() rawQuery: Record<string, unknown>) {
    return this.candidates.list(
      vocabularyCandidateListQuerySchema.parse(rawQuery),
    );
  }

  /** 후보 snapshot과 validation 상세를 조회한다 */
  @ApiOperation({ summary: 'AI 어휘 후보 상세를 조회한다' })
  @ApiParam({ name: 'candidateId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: VocabularyCandidateDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get(':candidateId')
  get(@Param() rawPath: Record<string, unknown>) {
    const { candidateId } = vocabularyCandidatePathSchema.parse(rawPath);
    return executeVocabularyCandidateOperation(() =>
      this.candidates.get(candidateId),
    );
  }

  /** 완전한 graph DRAFT 생성 또는 기존 어휘 연결로 후보를 승인한다 */
  @ApiOperation({ summary: 'AI 어휘 후보를 승인한다' })
  @ApiParam({ name: 'candidateId', type: 'string', format: 'uuid' })
  @ApiBody({ type: VocabularyCandidateApproveRequestDto })
  @ApiOkResponse({ type: VocabularyCandidateApproveResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':candidateId/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    const { candidateId } = vocabularyCandidatePathSchema.parse(rawPath);
    const request = vocabularyCandidateApproveRequestSchema.parse(rawBody);
    return executeVocabularyCandidateOperation(() =>
      this.candidates.approve(actorContext(user), candidateId, request),
    );
  }

  /** PENDING 후보를 terminal 폐기하고 revision 응답을 반환한다 */
  @ApiOperation({ summary: 'AI 어휘 후보를 폐기한다' })
  @ApiParam({ name: 'candidateId', type: 'string', format: 'uuid' })
  @ApiBody({ type: VocabularyCandidateDiscardRequestDto })
  @ApiOkResponse({ type: VocabularyCandidateDiscardResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Delete(':candidateId')
  @HttpCode(200)
  discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    const { candidateId } = vocabularyCandidatePathSchema.parse(rawPath);
    const request = vocabularyCandidateDiscardRequestSchema.parse(rawBody);
    return executeVocabularyCandidateOperation(() =>
      this.candidates.discard(actorContext(user), candidateId, request),
    );
  }
}

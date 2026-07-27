/** ADMIN+MFA AI 문제 후보 조회·승인·폐기·재생성 HTTP 경계를 제공한다 */
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
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  approveQuestionCandidateRequestSchema,
  discardQuestionCandidateRequestSchema,
  questionCandidateListQuerySchema,
  questionCandidatePathSchema,
  regenerateQuestionCandidateRequestSchema,
} from '@flex-thia/contracts';
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
import {
  ApproveQuestionCandidateRequestDto,
  ApproveQuestionCandidateResponseDto,
  DiscardQuestionCandidateRequestDto,
  QuestionCandidateDetailResponseDto,
  QuestionCandidateListQueryDto,
  QuestionCandidateListResponseDto,
  QuestionCandidatePathDto,
  RegenerateQuestionCandidateRequestDto,
  RegenerateQuestionCandidateResponseDto,
} from './question-production.dto.js';
import {
  QuestionCandidateApplicationError,
  QuestionCandidateApplicationService,
} from './question-production.service.js';

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

// 기능 소유 오류만 공개 상태로 바꾸고 나머지는 공통 filter로 전달한다.
const executeQuestionCandidateOperation = async <Result>(
  operation: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await operation();
  } catch (error) {
    const code = readErrorCode(error);
    if (
      error instanceof QuestionCandidateApplicationError &&
      code === 'QUESTION_CANDIDATE_NOT_FOUND'
    ) {
      throw new NotFoundException({ code });
    }
    if (code === 'QUESTION_CANDIDATE_NOT_APPROVABLE') {
      throw new BadRequestException({ code });
    }
    if (
      code === 'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT' ||
      code === 'QUESTION_CANDIDATE_REVIEW_CONFLICT'
    ) {
      throw new ConflictException({ code });
    }
    throw error;
  }
};

/** ADMIN과 TOTP 등록을 요구하는 AI 문제 후보 endpoint */
@ApiTags('Admin Question Candidates')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  QuestionCandidateListQueryDto,
  QuestionCandidateListResponseDto,
  QuestionCandidatePathDto,
  QuestionCandidateDetailResponseDto,
  ApproveQuestionCandidateRequestDto,
  ApproveQuestionCandidateResponseDto,
  DiscardQuestionCandidateRequestDto,
  RegenerateQuestionCandidateRequestDto,
  RegenerateQuestionCandidateResponseDto,
)
@Controller('admin/content-production/question-candidates')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class QuestionCandidateController {
  constructor(
    private readonly candidates: QuestionCandidateApplicationService,
  ) {}

  /** 결과 그룹과 검수 상태로 후보 summary page를 조회한다 */
  @ApiOperation({ summary: 'AI 문제 후보 목록을 조회한다' })
  @ApiQuery({ type: QuestionCandidateListQueryDto })
  @ApiOkResponse({ type: QuestionCandidateListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get()
  list(@Query() rawQuery: Record<string, unknown>) {
    return this.candidates.list(
      questionCandidateListQuerySchema.parse(rawQuery),
    );
  }

  /** canonical graph와 allow-list 검증 evidence를 조회한다 */
  @ApiOperation({ summary: 'AI 문제 후보 상세를 조회한다' })
  @ApiParam({ name: 'candidateId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: QuestionCandidateDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get(':candidateId')
  get(@Param() rawPath: Record<string, unknown>) {
    const { candidateId } = questionCandidatePathSchema.parse(rawPath);
    return executeQuestionCandidateOperation(() =>
      this.candidates.get(candidateId),
    );
  }

  /** 검증 완료 NORMAL 후보를 DRAFT 문제로 승인한다 */
  @ApiOperation({ summary: 'AI 문제 후보를 승인한다' })
  @ApiParam({ name: 'candidateId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApproveQuestionCandidateRequestDto })
  @ApiOkResponse({ type: ApproveQuestionCandidateResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':candidateId/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    const { candidateId } = questionCandidatePathSchema.parse(rawPath);
    const request = approveQuestionCandidateRequestSchema.parse(rawBody);
    return executeQuestionCandidateOperation(() =>
      this.candidates.approve(actorContext(user), candidateId, request),
    );
  }

  /** PENDING 후보를 terminal 폐기하고 204를 반환한다 */
  @ApiOperation({ summary: 'AI 문제 후보를 폐기한다' })
  @ApiParam({ name: 'candidateId', type: 'string', format: 'uuid' })
  @ApiBody({ type: DiscardQuestionCandidateRequestDto })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Delete(':candidateId')
  @HttpCode(204)
  async discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const { candidateId } = questionCandidatePathSchema.parse(rawPath);
    const request = discardQuestionCandidateRequestSchema.parse(rawBody);
    await executeQuestionCandidateOperation(() =>
      this.candidates.discard(actorContext(user), candidateId, request),
    );
  }

  /** 원본 후보를 보존하고 새 생성 attempt를 접수한다 */
  @ApiOperation({ summary: 'AI 문제 후보 재생성을 요청한다' })
  @ApiParam({ name: 'candidateId', type: 'string', format: 'uuid' })
  @ApiBody({ type: RegenerateQuestionCandidateRequestDto })
  @ApiAcceptedResponse({ type: RegenerateQuestionCandidateResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':candidateId/regenerate')
  @HttpCode(202)
  regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    const { candidateId } = questionCandidatePathSchema.parse(rawPath);
    const request = regenerateQuestionCandidateRequestSchema.parse(rawBody);
    return executeQuestionCandidateOperation(() =>
      this.candidates.regenerate(actorContext(user), candidateId, request),
    );
  }
}

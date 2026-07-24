/** 인증된 학습자의 문제 조회·답안·저장 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  questionAttemptListQuerySchema,
  questionAttemptListResponseSchema,
  questionDetailResponseSchema,
  questionIdPathSchema,
  questionListQuerySchema,
  questionListResponseSchema,
  submitQuestionAttemptRequestSchema,
  submitQuestionAttemptResponseSchema,
  type QuestionAttemptListResponse,
  type QuestionDetailResponse,
  type QuestionListResponse,
  type SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponse } from '../openapi/openapi.decorators.js';
import {
  ProblemDetailsDto,
  QuestionAttemptListQueryDto,
  QuestionAttemptListResponseDto,
  QuestionDetailResponseDto,
  QuestionIdPathDto,
  QuestionListQueryDto,
  QuestionListResponseDto,
  SubmitQuestionAttemptRequestDto,
  SubmitQuestionAttemptResponseDto,
} from '../openapi/openapi.dto.js';
import { LearnerContentService } from './learner-content.service.js';

/** LEARNER와 상속된 ADMIN이 사용하는 문제 endpoint */
@ApiTags('Learner Questions')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  QuestionIdPathDto,
  QuestionListQueryDto,
  QuestionListResponseDto,
  QuestionDetailResponseDto,
  SubmitQuestionAttemptRequestDto,
  SubmitQuestionAttemptResponseDto,
  QuestionAttemptListQueryDto,
  QuestionAttemptListResponseDto,
)
@Controller()
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('LEARNER')
export class LearnerQuestionsController {
  constructor(private readonly learning: LearnerContentService) {}

  /** 검증된 필터로 현재 공개 문제 page를 조회한다 */
  @ApiOperation({ summary: '현재 공개 문제를 필터와 함께 조회한다' })
  @ApiQuery({ type: QuestionListQueryDto })
  @ApiOkResponse({ type: QuestionListResponseDto })
  @ApiProblemResponse(400, 'query가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Get('questions')
  async listQuestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<QuestionListResponse> {
    const query = questionListQuerySchema.parse(rawQuery);
    return questionListResponseSchema.parse(
      await this.learning.listQuestions(user.userId, query),
    );
  }

  /** 현재 게시 버전의 정답 없는 문제 상세를 조회한다 */
  @ApiOperation({ summary: '현재 공개 문제 상세를 조회한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: QuestionDetailResponseDto })
  @ApiProblemResponse(400, 'path가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(404, '현재 공개 문제를 찾을 수 없음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Get('questions/:questionId')
  async getQuestionDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<QuestionDetailResponse> {
    const path = questionIdPathSchema.parse(rawPath);
    return questionDetailResponseSchema.parse(
      await this.learning.getQuestionDetail(user.userId, path.questionId),
    );
  }

  /** 첫 답·재시도 또는 멱등 재전송의 historical 피드백을 반환한다 */
  @ApiOperation({ summary: '문제 답안을 제출한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiBody({ type: SubmitQuestionAttemptRequestDto })
  @ApiCreatedResponse({ type: SubmitQuestionAttemptResponseDto })
  @ApiProblemResponse(400, 'path 또는 body가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(409, '문제 가용성·선택지·멱등 조건이 충돌함')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Post('questions/:questionId/attempts')
  @HttpCode(201)
  async submitQuestionAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<SubmitQuestionAttemptResponse> {
    const path = questionIdPathSchema.parse(rawPath);
    const body = submitQuestionAttemptRequestSchema.parse(rawBody);
    return submitQuestionAttemptResponseSchema.parse(
      await this.learning.submitQuestionAttempt(
        user.userId,
        path.questionId,
        body,
      ),
    );
  }

  /** 콘텐츠 상태와 무관한 현재 사용자의 append-only 풀이 기록을 조회한다 */
  @ApiOperation({ summary: '내 원시 풀이 기록을 조회한다' })
  @ApiQuery({ type: QuestionAttemptListQueryDto })
  @ApiOkResponse({ type: QuestionAttemptListResponseDto })
  @ApiProblemResponse(400, 'query가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Get('me/question-attempts')
  async listAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<QuestionAttemptListResponse> {
    const query = questionAttemptListQuerySchema.parse(rawQuery);
    return questionAttemptListResponseSchema.parse(
      await this.learning.listAttempts(user.userId, query),
    );
  }

  /** 현재 공개 문제를 사용자 저장 목록에 멱등 연결한다 */
  @ApiOperation({ summary: '문제를 저장한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponse(400, 'path가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(409, '현재 공개 문제로 저장할 수 없음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Put('me/saved-questions/:questionId')
  @HttpCode(204)
  async saveQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = questionIdPathSchema.parse(rawPath);
    await this.learning.saveQuestion(user.userId, path.questionId);
  }

  /** 문제 공개 상태를 다시 확인하지 않고 저장 연결을 멱등 제거한다 */
  @ApiOperation({ summary: '저장한 문제를 해제한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponse(400, 'path가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Delete('me/saved-questions/:questionId')
  @HttpCode(204)
  async removeQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = questionIdPathSchema.parse(rawPath);
    await this.learning.removeQuestion(user.userId, path.questionId);
  }
}

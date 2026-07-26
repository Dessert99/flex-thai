/** 인증된 학습자의 단어 연습 세션 생성·조회·답안 HTTP 경계를 제공한다 */
import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  createVocabularyPracticeRequestSchema,
  submitVocabularyPracticeAnswerRequestSchema,
  vocabularyPracticeAnswerResponseSchema,
  vocabularyPracticeQuestionPathSchema,
  vocabularyPracticeSessionPathSchema,
  vocabularyPracticeSessionResponseSchema,
  type VocabularyPracticeAnswerResponse,
  type VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';
import type { ZodObject } from 'zod';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponse } from '../openapi/openapi.decorators.js';
import { LearnerVocabularyPracticeService } from './learner-vocabulary-practice.service.js';

class CreateVocabularyPracticeRequestDto extends createZodDto(
  createVocabularyPracticeRequestSchema,
) {}
class VocabularyPracticeSessionResponseDto extends createZodDto(
  vocabularyPracticeSessionResponseSchema as unknown as ZodObject,
) {}
class SubmitVocabularyPracticeAnswerRequestDto extends createZodDto(
  submitVocabularyPracticeAnswerRequestSchema,
) {}
class VocabularyPracticeAnswerResponseDto extends createZodDto(
  vocabularyPracticeAnswerResponseSchema,
) {}

const ApiVocabularyPracticeProblems = () =>
  applyDecorators(
    ApiProblemResponse(400, '요청이 공개 계약과 일치하지 않음'),
    ApiProblemResponse(401, 'access token이 없거나 올바르지 않음'),
    ApiProblemResponse(
      403,
      '학습자 역할 또는 계정 상태가 요청을 허용하지 않음',
    ),
    ApiProblemResponse(404, '소유 source 또는 세션을 찾을 수 없음'),
    ApiProblemResponse(409, '출제 후보·세션·답안 상태가 충돌함'),
    ApiProblemResponse(500, '예상하지 못한 서버 오류'),
  );

/** LEARNER와 상속된 ADMIN이 사용하는 단어 연습 endpoint */
@ApiTags('Learner Vocabulary Practice')
@ApiBearerAuth('accessToken')
@Controller()
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('LEARNER')
export class LearnerVocabularyPracticeController {
  constructor(
    private readonly vocabularyPractice: LearnerVocabularyPracticeService,
  ) {}

  /** 선택 source와 설정으로 단어 연습 세션을 생성한다 */
  @ApiOperation({ summary: '단어 연습 세션을 생성한다' })
  @ApiBody({ type: CreateVocabularyPracticeRequestDto })
  @ApiCreatedResponse({ type: VocabularyPracticeSessionResponseDto })
  @ApiVocabularyPracticeProblems()
  @Post('me/vocabulary-practice/sessions')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
  ): Promise<VocabularyPracticeSessionResponse> {
    const request = createVocabularyPracticeRequestSchema.parse(rawBody);
    return this.vocabularyPractice.create(user.userId, request);
  }

  /** 현재 사용자의 세션과 답변 진행을 조회한다 */
  @ApiOperation({ summary: '단어 연습 세션을 조회한다' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: VocabularyPracticeSessionResponseDto })
  @ApiVocabularyPracticeProblems()
  @Get('me/vocabulary-practice/sessions/:sessionId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<VocabularyPracticeSessionResponse> {
    const path = vocabularyPracticeSessionPathSchema.parse(rawPath);
    return this.vocabularyPractice.get(user.userId, path.sessionId);
  }

  /** 현재 문항의 선택지를 한 번 제출한다 */
  @ApiOperation({ summary: '단어 연습 답안을 제출한다' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiBody({ type: SubmitVocabularyPracticeAnswerRequestDto })
  @ApiOkResponse({ type: VocabularyPracticeAnswerResponseDto })
  @ApiVocabularyPracticeProblems()
  @Post(
    'me/vocabulary-practice/sessions/:sessionId/questions/:questionId/answers',
  )
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<VocabularyPracticeAnswerResponse> {
    const path = vocabularyPracticeQuestionPathSchema.parse(rawPath);
    const request = submitVocabularyPracticeAnswerRequestSchema.parse(rawBody);
    return this.vocabularyPractice.answer(
      user.userId,
      path.sessionId,
      path.questionId,
      request,
    );
  }
}

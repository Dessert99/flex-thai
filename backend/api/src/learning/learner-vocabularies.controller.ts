/** 인증된 학습자의 공용 어휘 HTTP 경계를 제공한다 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  vocabularyDetailResponseSchema,
  vocabularyIdPathSchema,
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
  vocabularyRelatedQuestionsQuerySchema,
  vocabularyRelatedQuestionsResponseSchema,
  type VocabularyDetailResponse,
  type VocabularyListResponse,
  type VocabularyRelatedQuestionsResponse,
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
  VocabularyDetailResponseDto,
  VocabularyIdPathDto,
  VocabularyListQueryDto,
  VocabularyListResponseDto,
  VocabularyRelatedQuestionsQueryDto,
  VocabularyRelatedQuestionsResponseDto,
} from '../openapi/openapi.dto.js';
import {
  LearnerContentService,
  parseLearnerPublicResponse,
} from './learner-content.service.js';

/** LEARNER와 상속된 ADMIN이 사용하는 어휘 endpoint */
@ApiTags('Learner Vocabularies')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  VocabularyIdPathDto,
  VocabularyListQueryDto,
  VocabularyListResponseDto,
  VocabularyDetailResponseDto,
  VocabularyRelatedQuestionsQueryDto,
  VocabularyRelatedQuestionsResponseDto,
)
@Controller()
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('LEARNER')
export class LearnerVocabulariesController {
  constructor(private readonly learning: LearnerContentService) {}

  /** 게시 어휘를 검색·분류·난이도 조건으로 조회한다 */
  @ApiOperation({ summary: '공용 어휘와 표현을 검색한다' })
  @ApiQuery({ type: VocabularyListQueryDto })
  @ApiOkResponse({ type: VocabularyListResponseDto })
  @ApiProblemResponse(400, 'query가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Get('vocabularies')
  async listVocabularies(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<VocabularyListResponse> {
    const query = vocabularyListQuerySchema.parse(rawQuery);
    return parseLearnerPublicResponse(
      vocabularyListResponseSchema,
      await this.learning.listVocabularies(user.userId, query),
    );
  }

  /** 게시 어휘의 뜻·발음·예문 상세를 조회한다 */
  @ApiOperation({ summary: '공용 어휘 상세를 조회한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: VocabularyDetailResponseDto })
  @ApiProblemResponse(400, 'path가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(404, '현재 공개 어휘를 찾을 수 없음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Get('vocabularies/:vocabularyId')
  async getVocabularyDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<VocabularyDetailResponse> {
    const path = vocabularyIdPathSchema.parse(rawPath);
    return parseLearnerPublicResponse(
      vocabularyDetailResponseSchema,
      await this.learning.getVocabularyDetail(user.userId, path.vocabularyId),
    );
  }

  /** 게시 어휘를 사용하는 현재 공개 문제 page를 조회한다 */
  @ApiOperation({ summary: '어휘가 사용된 현재 공개 문제를 조회한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiQuery({ type: VocabularyRelatedQuestionsQueryDto })
  @ApiOkResponse({ type: VocabularyRelatedQuestionsResponseDto })
  @ApiProblemResponse(400, 'path 또는 query가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(404, '현재 공개 어휘를 찾을 수 없음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Get('vocabularies/:vocabularyId/questions')
  async listRelatedQuestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<VocabularyRelatedQuestionsResponse> {
    const path = vocabularyIdPathSchema.parse(rawPath);
    const query = vocabularyRelatedQuestionsQuerySchema.parse(rawQuery);
    return parseLearnerPublicResponse(
      vocabularyRelatedQuestionsResponseSchema,
      await this.learning.listRelatedQuestions(
        user.userId,
        path.vocabularyId,
        query,
      ),
    );
  }
}

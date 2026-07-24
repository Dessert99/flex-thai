/** 인증된 학습자의 공용·저장 어휘 HTTP 경계를 제공한다 */
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  savedVocabularyListQuerySchema,
  savedVocabularyListResponseSchema,
  vocabularyDetailResponseSchema,
  vocabularyIdPathSchema,
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
  vocabularyRelatedQuestionsQuerySchema,
  vocabularyRelatedQuestionsResponseSchema,
  type SavedVocabularyListResponse,
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
  SavedVocabularyListQueryDto,
  SavedVocabularyListResponseDto,
  VocabularyDetailResponseDto,
  VocabularyIdPathDto,
  VocabularyListQueryDto,
  VocabularyListResponseDto,
  VocabularyRelatedQuestionsQueryDto,
  VocabularyRelatedQuestionsResponseDto,
} from '../openapi/openapi.dto.js';
import { LearnerContentService } from './learner-content.service.js';

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
  SavedVocabularyListQueryDto,
  SavedVocabularyListResponseDto,
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
    return vocabularyListResponseSchema.parse(
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
    return vocabularyDetailResponseSchema.parse(
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
    return vocabularyRelatedQuestionsResponseSchema.parse(
      await this.learning.listRelatedQuestions(
        user.userId,
        path.vocabularyId,
        query,
      ),
    );
  }

  /** 현재 사용자가 저장한 게시 어휘 page를 조회한다 */
  @ApiOperation({ summary: '내가 저장한 어휘를 조회한다' })
  @ApiQuery({ type: SavedVocabularyListQueryDto })
  @ApiOkResponse({ type: SavedVocabularyListResponseDto })
  @ApiProblemResponse(400, 'query가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Get('me/saved-vocabularies')
  async listSavedVocabularies(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<SavedVocabularyListResponse> {
    const query = savedVocabularyListQuerySchema.parse(rawQuery);
    return savedVocabularyListResponseSchema.parse(
      await this.learning.listSavedVocabularies(user.userId, query),
    );
  }

  /** 현재 게시 어휘를 사용자 저장 목록에 멱등 연결한다 */
  @ApiOperation({ summary: '어휘를 저장한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponse(400, 'path가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(404, '현재 공개 어휘로 저장할 수 없음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Put('me/saved-vocabularies/:vocabularyId')
  @HttpCode(204)
  async saveVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = vocabularyIdPathSchema.parse(rawPath);
    await this.learning.saveVocabulary(user.userId, path.vocabularyId);
  }

  /** 어휘 공개 상태를 다시 확인하지 않고 저장 연결을 멱등 제거한다 */
  @ApiOperation({ summary: '저장한 어휘를 해제한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponse(400, 'path가 공개 계약과 일치하지 않음')
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '학습자 역할 또는 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
  @Delete('me/saved-vocabularies/:vocabularyId')
  @HttpCode(204)
  async removeVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = vocabularyIdPathSchema.parse(rawPath);
    await this.learning.removeVocabulary(user.userId, path.vocabularyId);
  }
}

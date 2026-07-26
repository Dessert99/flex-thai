/** 인증된 학습자의 단어장 CRUD·검색·membership HTTP 경계를 제공한다 */
import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  vocabularyIdPathSchema,
  wordbookBulkItemsRequestSchema,
  wordbookIdPathSchema,
  wordbookItemListQuerySchema,
  wordbookItemPathSchema,
  wordbookNameRequestSchema,
  wordbookRemoveItemsRequestSchema,
  type VocabularyWordbookMembershipResponse,
  type WordbookItemListResponse,
  type WordbookListResponse,
  type WordbookResponse,
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
  VocabularyWordbookMembershipResponseDto,
  WordbookBulkItemsRequestDto,
  WordbookItemListQueryDto,
  WordbookItemListResponseDto,
  WordbookListResponseDto,
  WordbookNameRequestDto,
  WordbookRemoveItemsRequestDto,
  WordbookResponseDto,
} from '../openapi/openapi.dto.js';
import { LearnerWordbooksService } from './learner-wordbooks.service.js';

const ApiWordbookProblems = (notFound = true) =>
  applyDecorators(
    ApiProblemResponse(400, '요청이 공개 계약과 일치하지 않음'),
    ApiProblemResponse(401, 'access token이 없거나 올바르지 않음'),
    ApiProblemResponse(
      403,
      '학습자 역할 또는 계정 상태가 요청을 허용하지 않음',
    ),
    ...(notFound
      ? [ApiProblemResponse(404, '소유 단어장 또는 공개 어휘를 찾을 수 없음')]
      : []),
    ApiProblemResponse(409, '같은 이름 또는 변경 대상이 충돌함'),
    ApiProblemResponse(500, '예상하지 못한 서버 오류'),
  );

/** LEARNER와 상속된 ADMIN이 사용하는 단어장 endpoint */
@ApiTags('Learner Wordbooks')
@ApiBearerAuth('accessToken')
@Controller()
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('LEARNER')
export class LearnerWordbooksController {
  constructor(private readonly wordbooks: LearnerWordbooksService) {}

  /** 현재 사용자의 단어장 목록을 조회한다 */
  @ApiOperation({ summary: '내 단어장 목록을 조회한다' })
  @ApiOkResponse({ type: WordbookListResponseDto })
  @ApiWordbookProblems(false)
  @Get('me/wordbooks')
  listWordbooks(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WordbookListResponse> {
    return this.wordbooks.listWordbooks(user.userId);
  }

  /** trim한 이름으로 단어장을 생성한다 */
  @ApiOperation({ summary: '내 단어장을 생성한다' })
  @ApiBody({ type: WordbookNameRequestDto })
  @ApiCreatedResponse({ type: WordbookResponseDto })
  @ApiWordbookProblems(false)
  @Post('me/wordbooks')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
  ): Promise<WordbookResponse> {
    const request = wordbookNameRequestSchema.parse(rawBody);
    return this.wordbooks.create(user.userId, request);
  }

  /** 소유 단어장의 이름을 변경한다 */
  @ApiOperation({ summary: '내 단어장 이름을 변경한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiBody({ type: WordbookNameRequestDto })
  @ApiOkResponse({ type: WordbookResponseDto })
  @ApiWordbookProblems()
  @Patch('me/wordbooks/:wordbookId')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<WordbookResponse> {
    const path = wordbookIdPathSchema.parse(rawPath);
    const request = wordbookNameRequestSchema.parse(rawBody);
    return this.wordbooks.rename(user.userId, path.wordbookId, request);
  }

  /** 소유 단어장을 삭제한다 */
  @ApiOperation({ summary: '내 단어장을 삭제한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiWordbookProblems()
  @Delete('me/wordbooks/:wordbookId')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = wordbookIdPathSchema.parse(rawPath);
    await this.wordbooks.delete(user.userId, path.wordbookId);
  }

  /** 소유 단어장의 공개 항목을 검색·필터·페이지로 조회한다 */
  @ApiOperation({ summary: '내 단어장 항목을 조회한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiQuery({ type: WordbookItemListQueryDto })
  @ApiOkResponse({ type: WordbookItemListResponseDto })
  @ApiWordbookProblems()
  @Get('me/wordbooks/:wordbookId/items')
  listItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<WordbookItemListResponse> {
    const path = wordbookIdPathSchema.parse(rawPath);
    const query = wordbookItemListQuerySchema.parse(rawQuery);
    return this.wordbooks.listItems(user.userId, path.wordbookId, query);
  }

  /** 현재 게시 어휘를 소유 단어장에 멱등 추가한다 */
  @ApiOperation({ summary: '어휘를 내 단어장에 추가한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiWordbookProblems()
  @Put('me/wordbooks/:wordbookId/items/:vocabularyId')
  @HttpCode(204)
  async addVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = wordbookItemPathSchema.parse(rawPath);
    await this.wordbooks.addVocabulary(
      user.userId,
      path.wordbookId,
      path.vocabularyId,
    );
  }

  /** 공개 상태와 무관하게 소유 단어장 membership을 멱등 제거한다 */
  @ApiOperation({ summary: '어휘를 내 단어장에서 제거한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiWordbookProblems()
  @Delete('me/wordbooks/:wordbookId/items/:vocabularyId')
  @HttpCode(204)
  async removeVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = wordbookItemPathSchema.parse(rawPath);
    await this.wordbooks.removeVocabulary(
      user.userId,
      path.wordbookId,
      path.vocabularyId,
    );
  }

  /** 선택 membership을 다른 소유 단어장에 복사한다 */
  @ApiOperation({ summary: '선택 항목을 다른 단어장에 복사한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiBody({ type: WordbookBulkItemsRequestDto })
  @ApiNoContentResponse()
  @ApiWordbookProblems()
  @Post('me/wordbooks/:wordbookId/items/copy')
  @HttpCode(204)
  async copyVocabularies(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const path = wordbookIdPathSchema.parse(rawPath);
    const request = wordbookBulkItemsRequestSchema.parse(rawBody);
    await this.wordbooks.copyVocabularies(
      user.userId,
      path.wordbookId,
      request,
    );
  }

  /** 선택 membership을 다른 소유 단어장으로 원자 이동한다 */
  @ApiOperation({ summary: '선택 항목을 다른 단어장으로 이동한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiBody({ type: WordbookBulkItemsRequestDto })
  @ApiNoContentResponse()
  @ApiWordbookProblems()
  @Post('me/wordbooks/:wordbookId/items/move')
  @HttpCode(204)
  async moveVocabularies(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const path = wordbookIdPathSchema.parse(rawPath);
    const request = wordbookBulkItemsRequestSchema.parse(rawBody);
    await this.wordbooks.moveVocabularies(
      user.userId,
      path.wordbookId,
      request,
    );
  }

  /** 선택 membership을 현재 소유 단어장에서 제거한다 */
  @ApiOperation({ summary: '선택 항목을 현재 단어장에서 제거한다' })
  @ApiParam({ name: 'wordbookId', type: 'string', format: 'uuid' })
  @ApiBody({ type: WordbookRemoveItemsRequestDto })
  @ApiNoContentResponse()
  @ApiWordbookProblems()
  @Post('me/wordbooks/:wordbookId/items/remove')
  @HttpCode(204)
  async removeVocabularies(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const path = wordbookIdPathSchema.parse(rawPath);
    const request = wordbookRemoveItemsRequestSchema.parse(rawBody);
    await this.wordbooks.removeVocabularies(
      user.userId,
      path.wordbookId,
      request,
    );
  }

  /** 어휘가 속한 현재 사용자 단어장 ID 목록을 조회한다 */
  @ApiOperation({ summary: '어휘의 내 단어장 membership을 조회한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: VocabularyWordbookMembershipResponseDto })
  @ApiWordbookProblems(false)
  @Get('me/vocabularies/:vocabularyId/wordbook-memberships')
  listMemberships(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<VocabularyWordbookMembershipResponse> {
    const path = vocabularyIdPathSchema.parse(rawPath);
    return this.wordbooks.listMemberships(user.userId, path.vocabularyId);
  }
}

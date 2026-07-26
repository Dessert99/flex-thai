/** 인증된 학습자의 게시 개념 HTTP 경계를 제공한다 */
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
  conceptIdPathSchema,
  conceptListQuerySchema,
  type ConceptDetailResponse,
  type ConceptListResponse,
} from '@flex-thia/contracts';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import {
  ConceptDetailResponseDto,
  ConceptIdPathDto,
  ConceptListQueryDto,
  ConceptListResponseDto,
} from './concepts.dto.js';
import { ConceptsService } from './concepts.service.js';

/** LEARNER와 상속된 ADMIN이 사용하는 개념 endpoint */
@ApiTags('Learner Concepts')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ConceptListQueryDto,
  ConceptListResponseDto,
  ConceptIdPathDto,
  ConceptDetailResponseDto,
)
@Controller()
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('LEARNER')
export class LearnerConceptsController {
  constructor(private readonly concepts: ConceptsService) {}

  /** 영역별 현재 게시 개념 카드를 조회한다 */
  @Get('concepts')
  @ApiOperation({ summary: '영역별 게시 개념 목록을 조회한다' })
  @ApiQuery({ type: ConceptListQueryDto })
  @ApiOkResponse({ type: ConceptListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  list(
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<ConceptListResponse> {
    const query = conceptListQuerySchema.parse(rawQuery);
    return this.concepts.listPublished(query.category);
  }

  /** 현재 게시 개념의 블록형 상세를 조회한다 */
  @Get('concepts/:conceptId')
  @ApiOperation({ summary: '게시 개념 상세를 조회한다' })
  @ApiParam({ name: 'conceptId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: ConceptDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  detail(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<ConceptDetailResponse> {
    return this.concepts.getPublishedDetail(
      conceptIdPathSchema.parse(rawPath).conceptId,
    );
  }
}

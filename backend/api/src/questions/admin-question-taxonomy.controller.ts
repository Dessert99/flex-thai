/** 관리자 문제 분류 설정 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
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
  ApiTags,
} from '@nestjs/swagger';
import {
  createQuestionTaxonomyTermRequestSchema,
  createQuestionTypeRequestSchema,
  createQuestionTypeVersionRequestSchema,
  questionTypeApprovedExampleRequestSchema,
  replaceDifficultyCriteriaRequestSchema,
} from '@flex-thia/contracts';
import { z } from 'zod';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import {
  CreateQuestionTaxonomyTermRequestDto,
  CreateQuestionTypeRequestDto,
  CreateQuestionTypeVersionRequestDto,
  QuestionTaxonomySettingsResponseDto,
  QuestionTypeApprovedExampleRequestDto,
  ReplaceDifficultyCriteriaRequestDto,
} from './question-taxonomy.dto.js';
import { QuestionTaxonomyFacade } from './question-taxonomy.facade.js';

const uuidPathSchema = z.object({ id: z.uuid() }).strict();
const questionTypePathSchema = z.object({ questionTypeId: z.uuid() }).strict();
const versionPathSchema = z.object({ versionId: z.uuid() }).strict();
const examplePathSchema = z
  .object({ versionId: z.uuid(), exampleId: z.uuid() })
  .strict();

/** ADMIN과 TOTP 등록을 요구하는 문제 분류 설정 endpoint */
@ApiTags('Admin Question Taxonomy')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  CreateQuestionTaxonomyTermRequestDto,
  CreateQuestionTypeRequestDto,
  CreateQuestionTypeVersionRequestDto,
  QuestionTaxonomySettingsResponseDto,
  QuestionTypeApprovedExampleRequestDto,
  ReplaceDifficultyCriteriaRequestDto,
)
@Controller('admin')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminQuestionTaxonomyController {
  constructor(private readonly taxonomy: QuestionTaxonomyFacade) {}

  /** 유형·버전·기준·예시·주제·태그 전체를 조회한다 */
  @Get('question-taxonomy')
  @ApiOperation({ summary: '문제 분류 설정 전체를 조회한다' })
  @ApiOkResponse({ type: QuestionTaxonomySettingsResponseDto })
  @ApiProblemResponses(401, 403, 500)
  settings() {
    return this.taxonomy.settings();
  }

  /** 논리 유형과 첫 DRAFT를 만든다 */
  @Post('question-types')
  @ApiOperation({ summary: '세부 문제 유형과 첫 DRAFT를 생성한다' })
  @ApiBody({ type: CreateQuestionTypeRequestDto })
  @HttpCode(201)
  @ApiCreatedResponse()
  @ApiProblemResponses(400, 401, 403, 409, 500)
  createQuestionType(@Body() rawBody: unknown) {
    return this.taxonomy.createQuestionType(
      createQuestionTypeRequestSchema.parse(rawBody),
    );
  }

  /** 기존 유형에 다음 DRAFT를 만든다 */
  @Post('question-types/:questionTypeId/versions')
  @ApiOperation({ summary: '세부 유형의 다음 DRAFT 버전을 생성한다' })
  @ApiParam({ name: 'questionTypeId', type: 'string', format: 'uuid' })
  @ApiBody({ type: CreateQuestionTypeVersionRequestDto })
  @HttpCode(201)
  @ApiCreatedResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  createVersion(
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    return this.taxonomy.createVersion(
      questionTypePathSchema.parse(rawPath).questionTypeId,
      createQuestionTypeVersionRequestSchema.parse(rawBody),
    );
  }

  /** DRAFT의 1~5 난이도 기준을 전체 교체한다 */
  @Put('question-type-versions/:versionId/difficulty-criteria')
  @ApiOperation({ summary: 'DRAFT 버전의 난이도 기준을 교체한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ReplaceDifficultyCriteriaRequestDto })
  @ApiOkResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  replaceCriteria(
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    return this.taxonomy.replaceCriteria(
      versionPathSchema.parse(rawPath).versionId,
      replaceDifficultyCriteriaRequestSchema.parse(rawBody),
    );
  }

  /** DRAFT에 canonical 승인 예시 snapshot을 추가한다 */
  @Post('question-type-versions/:versionId/examples')
  @ApiOperation({ summary: 'DRAFT 버전에 승인 예시를 추가한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiBody({ type: QuestionTypeApprovedExampleRequestDto })
  @HttpCode(201)
  @ApiCreatedResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  addExample(
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    return this.taxonomy.addExample(
      versionPathSchema.parse(rawPath).versionId,
      questionTypeApprovedExampleRequestSchema.parse(rawBody),
    );
  }

  /** DRAFT의 승인 예시 snapshot을 제거한다 */
  @Delete('question-type-versions/:versionId/examples/:exampleId')
  @ApiOperation({ summary: 'DRAFT 버전의 승인 예시를 제거한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'exampleId', type: 'string', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  removeExample(@Param() rawPath: Record<string, unknown>): Promise<void> {
    const path = examplePathSchema.parse(rawPath);
    return this.taxonomy.removeExample(path.versionId, path.exampleId);
  }

  /** 준비된 DRAFT를 ACTIVE로 전환한다 */
  @Post('question-type-versions/:versionId/activate')
  @ApiOperation({ summary: '준비된 DRAFT 버전을 활성화한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  activateVersion(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.activateVersion(
      versionPathSchema.parse(rawPath).versionId,
    );
  }

  /** ACTIVE 버전을 RETIRED로 전환한다 */
  @Post('question-type-versions/:versionId/retire')
  @ApiOperation({ summary: 'ACTIVE 버전을 보존 상태로 전환한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  retireVersion(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.retireVersion(
      versionPathSchema.parse(rawPath).versionId,
    );
  }

  /** 선택 가능한 문제 주제를 만든다 */
  @Post('question-topics')
  @ApiOperation({ summary: '문제 주제를 생성한다' })
  @ApiBody({ type: CreateQuestionTaxonomyTermRequestDto })
  @HttpCode(201)
  @ApiCreatedResponse()
  @ApiProblemResponses(400, 401, 403, 409, 500)
  createTopic(@Body() rawBody: unknown) {
    return this.taxonomy.createTerm(
      'TOPIC',
      createQuestionTaxonomyTermRequestSchema.parse(rawBody),
    );
  }

  /** 선택 가능한 문제 태그를 만든다 */
  @Post('question-tags')
  @ApiOperation({ summary: '문제 태그를 생성한다' })
  @ApiBody({ type: CreateQuestionTaxonomyTermRequestDto })
  @HttpCode(201)
  @ApiCreatedResponse()
  @ApiProblemResponses(400, 401, 403, 409, 500)
  createTag(@Body() rawBody: unknown) {
    return this.taxonomy.createTerm(
      'TAG',
      createQuestionTaxonomyTermRequestSchema.parse(rawBody),
    );
  }

  /** 문제 주제를 신규 선택 목록에서 보관한다 */
  @Post('question-topics/:id/archive')
  @ApiOperation({ summary: '문제 주제를 신규 선택 목록에서 보관한다' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 500)
  archiveTopic(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.archiveTerm('TOPIC', uuidPathSchema.parse(rawPath).id);
  }

  /** 문제 태그를 신규 선택 목록에서 보관한다 */
  @Post('question-tags/:id/archive')
  @ApiOperation({ summary: '문제 태그를 신규 선택 목록에서 보관한다' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 500)
  archiveTag(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.archiveTerm('TAG', uuidPathSchema.parse(rawPath).id);
  }
}

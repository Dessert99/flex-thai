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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
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
import {
  CreateQuestionTaxonomyTermRequestDto,
  CreateQuestionTypeRequestDto,
  CreateQuestionTypeVersionRequestDto,
  QuestionTaxonomySettingsResponseDto,
} from './question-taxonomy.dto.js';
import { QuestionTaxonomyFacade } from './question-taxonomy.facade.js';

const uuidPathSchema = z.object({ id: z.uuid() }).strict();
const questionTypePathSchema = z
  .object({ questionTypeId: z.uuid() })
  .strict();
const versionPathSchema = z.object({ versionId: z.uuid() }).strict();
const examplePathSchema = z
  .object({ versionId: z.uuid(), exampleId: z.uuid() })
  .strict();

/** ADMIN과 TOTP 등록을 요구하는 문제 분류 설정 endpoint */
@ApiTags('Admin Question Taxonomy')
@ApiBearerAuth('accessToken')
@Controller('admin')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminQuestionTaxonomyController {
  constructor(private readonly taxonomy: QuestionTaxonomyFacade) {}

  /** 유형·버전·기준·예시·주제·태그 전체를 조회한다 */
  @Get('question-taxonomy')
  @ApiOkResponse({ type: QuestionTaxonomySettingsResponseDto })
  settings() {
    return this.taxonomy.settings();
  }

  /** 논리 유형과 첫 DRAFT를 만든다 */
  @Post('question-types')
  @HttpCode(201)
  @ApiCreatedResponse({ type: CreateQuestionTypeRequestDto })
  createQuestionType(@Body() rawBody: unknown) {
    return this.taxonomy.createQuestionType(
      createQuestionTypeRequestSchema.parse(rawBody),
    );
  }

  /** 기존 유형에 다음 DRAFT를 만든다 */
  @Post('question-types/:questionTypeId/versions')
  @HttpCode(201)
  @ApiCreatedResponse({ type: CreateQuestionTypeVersionRequestDto })
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
  @HttpCode(201)
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
  @HttpCode(204)
  @ApiNoContentResponse()
  removeExample(@Param() rawPath: Record<string, unknown>): Promise<void> {
    const path = examplePathSchema.parse(rawPath);
    return this.taxonomy.removeExample(path.versionId, path.exampleId);
  }

  /** 준비된 DRAFT를 ACTIVE로 전환한다 */
  @Post('question-type-versions/:versionId/activate')
  @HttpCode(204)
  @ApiNoContentResponse()
  activateVersion(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.activateVersion(
      versionPathSchema.parse(rawPath).versionId,
    );
  }

  /** ACTIVE 버전을 RETIRED로 전환한다 */
  @Post('question-type-versions/:versionId/retire')
  @HttpCode(204)
  @ApiNoContentResponse()
  retireVersion(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.retireVersion(
      versionPathSchema.parse(rawPath).versionId,
    );
  }

  /** 선택 가능한 문제 주제를 만든다 */
  @Post('question-topics')
  @HttpCode(201)
  createTopic(@Body() rawBody: unknown) {
    return this.taxonomy.createTerm(
      'TOPIC',
      createQuestionTaxonomyTermRequestSchema.parse(rawBody),
    );
  }

  /** 선택 가능한 문제 태그를 만든다 */
  @Post('question-tags')
  @HttpCode(201)
  createTag(@Body() rawBody: unknown) {
    return this.taxonomy.createTerm(
      'TAG',
      createQuestionTaxonomyTermRequestSchema.parse(rawBody),
    );
  }

  /** 문제 주제를 신규 선택 목록에서 보관한다 */
  @Post('question-topics/:id/archive')
  @HttpCode(204)
  archiveTopic(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.archiveTerm('TOPIC', uuidPathSchema.parse(rawPath).id);
  }

  /** 문제 태그를 신규 선택 목록에서 보관한다 */
  @Post('question-tags/:id/archive')
  @HttpCode(204)
  archiveTag(@Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.taxonomy.archiveTerm('TAG', uuidPathSchema.parse(rawPath).id);
  }
}

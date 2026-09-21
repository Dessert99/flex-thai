/** 관리자 use case와 read model을 strict 공개 응답·감사 문맥으로 조립한다 */
import {
  contentImportDetailResponseSchema,
  contentImportListResponseSchema,
  type ContentImportDetailResponse,
  type ContentImportListQuery,
  type ContentImportListResponse,
  type ContentImportRequest,
} from '@flex-thia/contracts/admin/content-imports';

import {
  adminVocabularyDetailResponseSchema,
  adminVocabularyListResponseSchema,
  type AdminVocabularyDetailResponse,
  type AdminVocabularyListQuery,
  type AdminVocabularyListResponse,
  type AdminVocabularyReplaceRequest,
} from '@flex-thia/contracts/admin/vocabularies';
import {
  adminVocabularyMergePreviewResponseSchema,
  adminVocabularyMergeResponseSchema,
  adminVocabularyRelationSchema,
  type AdminVocabularyMergeExecuteRequest,
  type AdminVocabularyMergePreviewRequest,
  type AdminVocabularyMergePreviewResponse,
  type AdminVocabularyMergeResponse,
  type AdminVocabularyRelation,
  type AdminVocabularyRelationCreateRequest,
  type AdminVocabularyRelationUpdateRequest,
} from '@flex-thia/contracts/admin/vocabulary-relations';

import type { DrizzleAdminVocabularyQuery } from '@flex-thia/database/queries/drizzle-admin-vocabulary.query';
import type { DrizzleContentImportQuery } from '@flex-thia/database/queries/drizzle-content-import.query';
import type { ContentImportService } from '@flex-thia/domain/content-import/content-import.service';

import type { VocabularyAdminService } from '@flex-thia/domain/vocabulary/vocabulary-admin';
import { NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';

type ContentImports = Pick<ContentImportService, 'execute'>;
type ContentImportQuery = Pick<DrizzleContentImportQuery, 'findById' | 'list'>;
type Vocabularies = Pick<
  VocabularyAdminService,
  | 'setImportance'
  | 'createRelation'
  | 'deleteRelation'
  | 'hide'
  | 'merge'
  | 'previewMerge'
  | 'publish'
  | 'replace'
  | 'restore'
  | 'updateRelation'
>;
type VocabularyQuery = Pick<DrizzleAdminVocabularyQuery, 'findById' | 'list'>;

/** command와 audit에 전달할 검증 완료 관리자 요청 문맥 */
export interface AdminActorContext {
  userId: string;
  sub: string;
  requestId: string;
}

/** 요청 객체에서 확정된 ID와 인증 사용자를 관리자 감사 문맥으로 묶는다 */
export const createAdminActorContext = (
  user: AuthenticatedUser,
  requestId: string,
): AdminActorContext => ({
  userId: user.userId,
  sub: user.sub,
  requestId,
});

/** 관리자 facade가 조정하는 기존 Stage 3~8 use case와 read model */
export interface AdminContentDependencies {
  contentImports: ContentImports;
  contentImportQuery: ContentImportQuery;
  vocabularies: Vocabularies;
  vocabularyQuery: VocabularyQuery;
  now?: () => Date;
}

/** 내부 응답 검증 상세를 공개 오류로 흘리지 않는 generic 오류 */
export class AdminPublicResponseError extends Error {
  constructor() {
    super('ADMIN_PUBLIC_RESPONSE_INVALID');
    this.name = 'AdminPublicResponseError';
  }
}

/** strict 공개 schema 검증 실패를 상세 없는 내부 오류로 바꾼다 */
export const parseAdminPublicResponse = <Output>(
  schema: ZodType<Output>,
  value: unknown,
): Output => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AdminPublicResponseError();
  }
  return result.data;
};

const toAuditContext = (actor: AdminActorContext, occurredAt: Date) => ({
  actorSub: actor.sub,
  actorUserId: actor.userId,
  requestId: actor.requestId,
  occurredAt,
});

const toContentDraftContext = (actor: AdminActorContext, occurredAt: Date) => ({
  actorSub: actor.sub,
  actorUserId: actor.userId,
  requestId: actor.requestId,
  occurredAt,
});

const mapImportSummary = <T extends { createdAt: Date; completedAt: Date }>(
  summary: T,
) => ({
  ...summary,
  createdAt: summary.createdAt.toISOString(),
  completedAt: summary.completedAt.toISOString(),
});

const toVocabularyListQuery = (
  query: AdminVocabularyListQuery,
): Parameters<VocabularyQuery['list']>[0] => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.query === undefined ? {} : { query: query.query }),
  ...(query.kind === undefined ? {} : { kind: query.kind }),
  ...(query.status === undefined ? {} : { status: query.status }),
});

/** 관리자 콘텐츠 쓰기·조회 결과를 HTTP 공개 계약으로 제한한다 */
export class AdminContentService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: AdminContentDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** canonical 요청을 동기 처리하고 private hash·reference map 없는 상세를 반환한다 */
  async createContentImport(
    actor: AdminActorContext,
    idempotencyKey: string,
    request: ContentImportRequest,
  ): Promise<ContentImportDetailResponse> {
    const occurredAt = this.now();
    const detail = await this.dependencies.contentImports.execute({
      requestedBy: actor.userId,
      idempotencyKey,
      // Zod optional 출력의 explicit undefined 가능성만 제거된 domain 동형 계약이다.
      request: request as Parameters<ContentImports['execute']>[0]['request'],
      context: toContentDraftContext(actor, occurredAt),
    });
    return parseAdminPublicResponse(
      contentImportDetailResponseSchema,
      mapImportSummary(detail),
    );
  }

  /** 완료된 전체 가져오기 이력을 ISO 시각의 page로 반환한다 */
  async listContentImports(
    query: ContentImportListQuery,
  ): Promise<ContentImportListResponse> {
    const result = await this.dependencies.contentImportQuery.list(query);
    return parseAdminPublicResponse(contentImportListResponseSchema, {
      ...result,
      items: result.items.map(mapImportSummary),
    });
  }

  /** 완료된 가져오기 한 건을 항목별 안정 오류와 함께 반환한다 */
  async getContentImport(
    importId: string,
  ): Promise<ContentImportDetailResponse> {
    const detail =
      await this.dependencies.contentImportQuery.findById(importId);
    if (!detail) {
      throw new NotFoundException({ code: 'CONTENT_IMPORT_NOT_FOUND' });
    }
    return parseAdminPublicResponse(
      contentImportDetailResponseSchema,
      mapImportSummary(detail),
    );
  }

  setVocabularyImportance(
    actor: AdminActorContext,
    vocabularyId: string,
    importanceWeight: number,
  ): Promise<void> {
    return this.dependencies.vocabularies.setImportance({
      ...toAuditContext(actor, this.now()),
      vocabularyId,
      importanceWeight,
    });
  }

  async listVocabularies(
    query: AdminVocabularyListQuery,
  ): Promise<AdminVocabularyListResponse> {
    const result = await this.dependencies.vocabularyQuery.list(
      toVocabularyListQuery(query),
    );
    return parseAdminPublicResponse(adminVocabularyListResponseSchema, {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  }

  async getVocabulary(
    vocabularyId: string,
  ): Promise<AdminVocabularyDetailResponse> {
    const vocabulary =
      await this.dependencies.vocabularyQuery.findById(vocabularyId);
    if (!vocabulary) {
      throw new NotFoundException({ code: 'VOCABULARY_NOT_FOUND' });
    }
    return parseAdminPublicResponse(adminVocabularyDetailResponseSchema, {
      ...vocabulary,
      relations: vocabulary.relations.map((relation) => ({
        ...relation,
        createdAt: relation.createdAt.toISOString(),
        updatedAt: relation.updatedAt.toISOString(),
      })),
      createdAt: vocabulary.createdAt.toISOString(),
      updatedAt: vocabulary.updatedAt.toISOString(),
    });
  }

  /** 미사용 DRAFT 어휘 child graph를 canonical 요청으로 전체 교체한다 */
  async replaceVocabulary(
    actor: AdminActorContext,
    vocabularyId: string,
    input: AdminVocabularyReplaceRequest,
  ): Promise<void> {
    await this.dependencies.vocabularies.replace({
      vocabularyId,
      // 공개 Zod와 domain 입력의 exact-optional 표현 차이만 좁힌다.
      input: input as Parameters<Vocabularies['replace']>[0]['input'],
      ...toAuditContext(actor, this.now()),
    });
  }

  async publishVocabulary(
    actor: AdminActorContext,
    vocabularyId: string,
  ): Promise<void> {
    await this.dependencies.vocabularies.publish({
      vocabularyId,
      ...toAuditContext(actor, this.now()),
    });
  }

  /** 게시 어휘를 참조 보존 HIDDEN으로 전이한다 */
  async hideVocabulary(
    actor: AdminActorContext,
    vocabularyId: string,
  ): Promise<void> {
    await this.dependencies.vocabularies.hide({
      vocabularyId,
      ...toAuditContext(actor, this.now()),
    });
  }

  /** 숨김 어휘를 다시 PUBLISHED로 복구한다 */
  async restoreVocabulary(
    actor: AdminActorContext,
    vocabularyId: string,
  ): Promise<void> {
    await this.dependencies.vocabularies.restore({
      vocabularyId,
      ...toAuditContext(actor, this.now()),
    });
  }

  /** 두 뜻을 PENDING 관계로 연결한다 */
  async createVocabularyRelation(
    actor: AdminActorContext,
    vocabularyId: string,
    input: AdminVocabularyRelationCreateRequest,
  ): Promise<AdminVocabularyRelation> {
    const relation = await this.dependencies.vocabularies.createRelation({
      vocabularyId,
      input,
      ...toAuditContext(actor, this.now()),
    });
    return parseAdminPublicResponse(adminVocabularyRelationSchema, {
      ...relation,
      createdAt: relation.createdAt.toISOString(),
      updatedAt: relation.updatedAt.toISOString(),
    });
  }

  /** 관계 메타데이터 또는 검토 상태를 변경한다 */
  async updateVocabularyRelation(
    actor: AdminActorContext,
    vocabularyId: string,
    relationId: string,
    input: AdminVocabularyRelationUpdateRequest,
  ): Promise<AdminVocabularyRelation> {
    const relation = await this.dependencies.vocabularies.updateRelation({
      vocabularyId,
      relationId,
      // Zod optional 출력의 explicit undefined 가능성만 domain exact-optional로 좁힌다.
      input: input as Parameters<Vocabularies['updateRelation']>[0]['input'],
      ...toAuditContext(actor, this.now()),
    });
    return parseAdminPublicResponse(adminVocabularyRelationSchema, {
      ...relation,
      createdAt: relation.createdAt.toISOString(),
      updatedAt: relation.updatedAt.toISOString(),
    });
  }

  /** 경로 어휘에 연결된 관계를 삭제한다 */
  async deleteVocabularyRelation(
    vocabularyId: string,
    relationId: string,
  ): Promise<void> {
    await this.dependencies.vocabularies.deleteRelation({
      vocabularyId,
      relationId,
    });
  }

  /** source와 대표의 live graph 비교와 opaque token을 반환한다 */
  async previewVocabularyMerge(
    vocabularyId: string,
    input: AdminVocabularyMergePreviewRequest,
  ): Promise<AdminVocabularyMergePreviewResponse> {
    return parseAdminPublicResponse(
      adminVocabularyMergePreviewResponseSchema,
      await this.dependencies.vocabularies.previewMerge(
        vocabularyId,
        input.representativeVocabularyId,
      ),
    );
  }

  /** 같은 preview token일 때만 source의 live 참조를 대표로 병합한다 */
  async mergeVocabulary(
    actor: AdminActorContext,
    vocabularyId: string,
    input: AdminVocabularyMergeExecuteRequest,
  ): Promise<AdminVocabularyMergeResponse> {
    return parseAdminPublicResponse(
      adminVocabularyMergeResponseSchema,
      await this.dependencies.vocabularies.merge({
        sourceVocabularyId: vocabularyId,
        representativeVocabularyId: input.representativeVocabularyId,
        mergeToken: input.mergeToken,
        ...toAuditContext(actor, this.now()),
      }),
    );
  }
}

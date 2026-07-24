/** 관리자 use case와 read model을 strict 공개 응답·감사 문맥으로 조립한다 */
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import {
  adminQuestionDetailResponseSchema,
  adminQuestionListResponseSchema,
  adminQuestionValidationReportSchema,
  adminQuestionVersionResponseSchema,
  adminVocabularyDetailResponseSchema,
  adminVocabularyListResponseSchema,
  audioUploadResponseSchema,
  completeMediaAssetResponseSchema,
  contentImportDetailResponseSchema,
  contentImportListResponseSchema,
  mediaAssetDetailResponseSchema,
  type AdminQuestionDetailResponse,
  type AdminQuestionListQuery,
  type AdminQuestionListResponse,
  type AdminQuestionValidationReport,
  type AdminQuestionVersionPayload,
  type AdminQuestionVersionResponse,
  type AdminVocabularyDetailResponse,
  type AdminVocabularyListQuery,
  type AdminVocabularyListResponse,
  type AdminVocabularyReplaceRequest,
  type AudioUploadRequest,
  type AudioUploadResponse,
  type CompleteMediaAssetResponse,
  type ContentImportDetailResponse,
  type ContentImportListQuery,
  type ContentImportListResponse,
  type ContentImportRequest,
  type MediaAssetDetailResponse,
} from '@flex-thia/contracts';
import type {
  DrizzleAdminMediaQuery,
  DrizzleAdminQuestionQuery,
  DrizzleAdminVocabularyQuery,
  DrizzleContentImportQuery,
} from '@flex-thia/database';
import type {
  ContentImportService,
  MediaAdminService,
  QuestionAdminService,
  QuestionPublicationService,
  VocabularyAdminService,
} from '@flex-thia/domain';
import type { ZodType } from 'zod';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';

type ContentImports = Pick<ContentImportService, 'execute'>;
type ContentImportQuery = Pick<DrizzleContentImportQuery, 'findById' | 'list'>;
type Media = Pick<
  MediaAdminService,
  'completeAudioUpload' | 'requestAudioUpload'
>;
type MediaQuery = Pick<DrizzleAdminMediaQuery, 'findById'>;
type Questions = Pick<QuestionAdminService, 'cloneVersion' | 'replaceVersion'>;
type QuestionPublication = Pick<
  QuestionPublicationService,
  | 'hideQuestion'
  | 'invalidateVersion'
  | 'publishVersion'
  | 'restoreQuestion'
  | 'validateVersion'
>;
type QuestionQuery = Pick<DrizzleAdminQuestionQuery, 'findById' | 'list'>;
type Vocabularies = Pick<
  VocabularyAdminService,
  'hide' | 'publish' | 'replace' | 'restore'
>;
type VocabularyQuery = Pick<DrizzleAdminVocabularyQuery, 'findById' | 'list'>;

/** command와 audit에 전달할 검증 완료 관리자 요청 문맥 */
export interface AdminActorContext {
  userId: string;
  sub: string;
  requestId: string;
}

/** 선택적 요청 ID를 감사·오류 응답이 공유할 관리자 문맥으로 정규화한다 */
export const createAdminActorContext = (
  user: AuthenticatedUser,
  requestId: string | undefined,
): AdminActorContext => ({
  userId: user.userId,
  sub: user.sub,
  requestId:
    typeof requestId === 'string' && requestId.trim()
      ? requestId.trim()
      : randomUUID(),
});

/** 관리자 facade가 조정하는 기존 Stage 3~8 use case와 read model */
export interface AdminContentDependencies {
  contentImports: ContentImports;
  contentImportQuery: ContentImportQuery;
  media: Media;
  mediaQuery: MediaQuery;
  questions: Questions;
  questionPublication: QuestionPublication;
  questionQuery: QuestionQuery;
  vocabularies: Vocabularies;
  vocabularyQuery: VocabularyQuery;
  findQuestionIdByVersionId(versionId: string): Promise<string | null>;
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

const toQuestionListQuery = (
  query: AdminQuestionListQuery,
): Parameters<QuestionQuery['list']>[0] => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.status === undefined ? {} : { status: query.status }),
  ...(query.versionStatus === undefined
    ? {}
    : { versionStatus: query.versionStatus }),
  ...(query.validationStatus === undefined
    ? {}
    : { validationStatus: query.validationStatus }),
  ...(query.questionTypeSlug === undefined
    ? {}
    : { questionTypeSlug: query.questionTypeSlug }),
  ...(query.skill === undefined ? {} : { skill: query.skill }),
  ...(query.difficulty === undefined ? {} : { difficulty: query.difficulty }),
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

  /** 음성 선언과 actor 문맥으로 새 upload 또는 READY 재사용을 반환한다 */
  async requestAudioUpload(
    actor: AdminActorContext,
    request: AudioUploadRequest,
  ): Promise<AudioUploadResponse> {
    return parseAdminPublicResponse(
      audioUploadResponseSchema,
      await this.dependencies.media.requestAudioUpload({
        ...request,
        context: {
          actorSub: actor.sub,
          actorUserId: actor.userId,
          requestId: actor.requestId,
        },
      }),
    );
  }

  /** 실제 object 검증 결과에서 storage key를 제거한 READY 응답만 반환한다 */
  async completeMediaAsset(
    actor: AdminActorContext,
    mediaAssetId: string,
  ): Promise<CompleteMediaAssetResponse> {
    const asset = await this.dependencies.media.completeAudioUpload(
      mediaAssetId,
      {
        actorSub: actor.sub,
        actorUserId: actor.userId,
        requestId: actor.requestId,
      },
    );
    return parseAdminPublicResponse(completeMediaAssetResponseSchema, {
      mediaAssetId: asset.id,
      status: asset.status,
      readyAt: asset.readyAt.toISOString(),
    });
  }

  /** storage key 없는 media 상태와 사용처를 반환한다 */
  async getMediaAsset(mediaAssetId: string): Promise<MediaAssetDetailResponse> {
    const asset = await this.dependencies.mediaQuery.findById(mediaAssetId);
    if (!asset) {
      throw new NotFoundException({ code: 'MEDIA_ASSET_NOT_FOUND' });
    }
    return parseAdminPublicResponse(mediaAssetDetailResponseSchema, {
      ...asset,
      createdAt: asset.createdAt.toISOString(),
      readyAt: asset.readyAt?.toISOString() ?? null,
    });
  }

  /** 모든 상태 문제의 latest version page를 ISO 시각으로 반환한다 */
  async listQuestions(
    query: AdminQuestionListQuery,
  ): Promise<AdminQuestionListResponse> {
    const result = await this.dependencies.questionQuery.list(
      toQuestionListQuery(query),
    );
    return parseAdminPublicResponse(adminQuestionListResponseSchema, {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  }

  /** 모든 문제 버전의 검증·정답 ID를 관리자 공개 상세로 반환한다 */
  async getQuestion(questionId: string): Promise<AdminQuestionDetailResponse> {
    const question = await this.dependencies.questionQuery.findById(questionId);
    if (!question) {
      throw new NotFoundException({ code: 'QUESTION_NOT_FOUND' });
    }
    return parseAdminPublicResponse(adminQuestionDetailResponseSchema, {
      ...question,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
      versions: question.versions.map((version) => ({
        ...version,
        createdAt: version.createdAt.toISOString(),
        publishedAt: version.publishedAt?.toISOString() ?? null,
        validation: {
          ...version.validation,
          validatedAt: version.validation.validatedAt?.toISOString() ?? null,
        },
      })),
    });
  }

  /** 현재 게시 또는 latest version을 복제한 새 DRAFT 요약을 반환한다 */
  async cloneQuestionVersion(
    actor: AdminActorContext,
    questionId: string,
  ): Promise<AdminQuestionVersionResponse> {
    return parseAdminPublicResponse(
      adminQuestionVersionResponseSchema,
      await this.dependencies.questions.cloneVersion({
        questionId,
        ...toAuditContext(actor, this.now()),
      }),
    );
  }

  /** canonical payload로 DRAFT 전체를 교체하고 PENDING 요약을 반환한다 */
  async replaceQuestionVersion(
    actor: AdminActorContext,
    versionId: string,
    input: AdminQuestionVersionPayload,
  ): Promise<AdminQuestionVersionResponse> {
    return parseAdminPublicResponse(
      adminQuestionVersionResponseSchema,
      await this.dependencies.questions.replaceVersion({
        versionId,
        // 공개 Zod와 domain canonical 구조의 exact-optional 표현 차이만 좁힌다.
        input: input as Parameters<Questions['replaceVersion']>[0]['input'],
        ...toAuditContext(actor, this.now()),
      }),
    );
  }

  /** FAILED도 정상 결과로 보존한 최신 검증 보고서를 반환한다 */
  async validateQuestionVersion(
    actor: AdminActorContext,
    versionId: string,
  ): Promise<AdminQuestionValidationReport> {
    return parseAdminPublicResponse(
      adminQuestionValidationReportSchema,
      await this.dependencies.questionPublication.validateVersion({
        versionId,
        ...toAuditContext(actor, this.now()),
      }),
    );
  }

  /** version 소유 문제를 안전하게 해석한 뒤 DRAFT를 게시한다 */
  async publishQuestionVersion(
    actor: AdminActorContext,
    versionId: string,
  ): Promise<void> {
    const questionId = await this.requireQuestionIdByVersion(versionId);
    await this.dependencies.questionPublication.publishVersion({
      questionId,
      versionId,
      ...toAuditContext(actor, this.now()),
    });
  }

  /** version 소유 문제를 안전하게 해석한 뒤 현재 게시 버전을 무효화한다 */
  async invalidateQuestionVersion(
    actor: AdminActorContext,
    versionId: string,
  ): Promise<void> {
    const questionId = await this.requireQuestionIdByVersion(versionId);
    await this.dependencies.questionPublication.invalidateVersion({
      questionId,
      versionId,
      ...toAuditContext(actor, this.now()),
    });
  }

  /** 게시 문제를 즉시 숨기고 audit 문맥을 전달한다 */
  async hideQuestion(
    actor: AdminActorContext,
    questionId: string,
  ): Promise<void> {
    await this.dependencies.questionPublication.hideQuestion({
      questionId,
      ...toAuditContext(actor, this.now()),
    });
  }

  /** 유효한 current version이 있는 숨김 문제를 복구한다 */
  async restoreQuestion(
    actor: AdminActorContext,
    questionId: string,
  ): Promise<void> {
    await this.dependencies.questionPublication.restoreQuestion({
      questionId,
      ...toAuditContext(actor, this.now()),
    });
  }

  /** 모든 상태 어휘 page의 Date를 공개 ISO 시각으로 제한한다 */
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

  /** 뜻·발음·사용처를 storage key 없는 관리자 상세로 반환한다 */
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

  /** READY 발음이 있는 DRAFT 어휘를 게시한다 */
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

  private async requireQuestionIdByVersion(versionId: string): Promise<string> {
    const questionId =
      await this.dependencies.findQuestionIdByVersionId(versionId);
    if (!questionId) {
      throw new NotFoundException({ code: 'QUESTION_VERSION_NOT_FOUND' });
    }
    return questionId;
  }
}

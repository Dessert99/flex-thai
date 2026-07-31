/** 관리자 use case와 read model을 strict 공개 응답·감사 문맥으로 조립한다 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  adminQuestionDetailResponseSchema,
  adminQuestionListResponseSchema,
  adminQuestionTtsJobResponseSchema,
  adminQuestionValidationReportSchema,
  adminQuestionVersionResponseSchema,
  adminVocabularyDetailResponseSchema,
  adminVocabularyListResponseSchema,
  adminVocabularyMergePreviewResponseSchema,
  adminVocabularyMergeResponseSchema,
  adminVocabularyRelationSchema,
  audioUploadResponseSchema,
  completeMediaAssetResponseSchema,
  contentImportDetailResponseSchema,
  contentImportListResponseSchema,
  mediaAssetDetailResponseSchema,
  type AdminQuestionDetailResponse,
  type AdminQuestionListQuery,
  type AdminQuestionListResponse,
  type AdminQuestionTtsJobResponse,
  type AdminQuestionValidationReport,
  type AdminQuestionVersionPayload,
  type AdminQuestionVersionResponse,
  type AdminVocabularyDetailResponse,
  type AdminVocabularyListQuery,
  type AdminVocabularyListResponse,
  type AdminVocabularyMergeExecuteRequest,
  type AdminVocabularyMergePreviewRequest,
  type AdminVocabularyMergePreviewResponse,
  type AdminVocabularyMergeResponse,
  type AdminVocabularyRelation,
  type AdminVocabularyRelationCreateRequest,
  type AdminVocabularyRelationUpdateRequest,
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
  QuestionTtsRegenerationInput,
} from '@flex-thia/database';
import type {
  ContentImportService,
  MediaAdminService,
  MediaReadUrlProvider,
  QuestionAdminService,
  QuestionPublicationService,
  VocabularyAdminService,
} from '@flex-thia/domain';
import { QuestionTtsRegenerationError as QuestionTtsRegenerationDomainError } from '@flex-thia/domain';
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
type QuestionTts = {
  regenerate(
    input: QuestionTtsRegenerationInput,
  ): Promise<AdminQuestionTtsJobResponse>;
};
type Vocabularies = Pick<
  VocabularyAdminService,
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
  media: Media;
  mediaQuery: MediaQuery;
  questions: Questions;
  questionPublication: QuestionPublication;
  questionQuery: QuestionQuery;
  questionTts: QuestionTts;
  mediaReadUrls: MediaReadUrlProvider;
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
    const expiresAt = new Date(this.now().getTime() + 5 * 60 * 1_000);
    const signedUrls = new Map<string, Promise<string>>();
    const mapSentence = async (
      sentence: (typeof question.versions)[number]['blocks'][number]['sentences'][number]['sentence'],
    ) => {
      let audio:
        | { status: 'MISSING'; readUrl: null }
        | { status: 'UPLOADING' | 'FAILED'; readUrl: null }
        | { status: 'READY'; readUrl: string };
      if (sentence.mediaAssetId === null) {
        audio = { status: 'MISSING', readUrl: null };
      } else if (sentence.mediaStatus === 'READY') {
        if (sentence.mediaStorageKey === null) {
          throw new AdminPublicResponseError();
        }
        const pending =
          signedUrls.get(sentence.mediaStorageKey) ??
          this.dependencies.mediaReadUrls.createReadUrl(
            sentence.mediaStorageKey,
            expiresAt,
          );
        signedUrls.set(sentence.mediaStorageKey, pending);
        audio = { status: 'READY', readUrl: await pending };
      } else {
        audio = {
          status: sentence.mediaStatus === 'REJECTED' ? 'FAILED' : 'UPLOADING',
          readUrl: null,
        };
      }
      return {
        id: sentence.id,
        originalText: sentence.originalText,
        translationKo: sentence.translationKo,
        pronunciationKo: sentence.pronunciationKo,
        toneMarks: sentence.toneMarks,
        mediaAssetId: sentence.mediaAssetId,
        audio,
        tokens: sentence.tokens,
        expressions: sentence.expressions,
      };
    };
    return parseAdminPublicResponse(adminQuestionDetailResponseSchema, {
      ...question,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
      versions: await Promise.all(
        question.versions.map(async (version) => ({
          ...version,
          createdAt: version.createdAt.toISOString(),
          publishedAt: version.publishedAt?.toISOString() ?? null,
          validation: {
            ...version.validation,
            validatedAt: version.validation.validatedAt?.toISOString() ?? null,
          },
          blocks: await Promise.all(
            version.blocks.map(async (block) => ({
              ...block,
              sentences: await Promise.all(
                block.sentences.map(async (sentence) => ({
                  ...sentence,
                  sentence: await mapSentence(sentence.sentence),
                })),
              ),
            })),
          ),
          options: await Promise.all(
            version.options.map(async (option) => ({
              ...option,
              sentence: await mapSentence(option.sentence),
            })),
          ),
        })),
      ),
    });
  }

  /** DRAFT의 누락 문장만 TTS로 예약하고 동일 요청 결과를 재사용한다 */
  async regenerateQuestionVersionTts(
    actor: AdminActorContext,
    questionId: string,
    versionId: string,
  ): Promise<AdminQuestionTtsJobResponse> {
    try {
      return parseAdminPublicResponse(
        adminQuestionTtsJobResponseSchema,
        await this.dependencies.questionTts.regenerate({
          questionId,
          versionId,
          actorUserId: actor.userId,
          actorSub: actor.sub,
          requestId: actor.requestId,
          requestedAt: this.now(),
        }),
      );
    } catch (error) {
      if (!(error instanceof QuestionTtsRegenerationDomainError)) throw error;
      if (error.code === 'QUESTION_TTS_VERSION_NOT_FOUND') {
        throw new NotFoundException({ code: error.code });
      }
      throw new ConflictException({ code: error.code });
    }
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

  private async requireQuestionIdByVersion(versionId: string): Promise<string> {
    const questionId =
      await this.dependencies.findQuestionIdByVersionId(versionId);
    if (!questionId) {
      throw new NotFoundException({ code: 'QUESTION_VERSION_NOT_FOUND' });
    }
    return questionId;
  }
}

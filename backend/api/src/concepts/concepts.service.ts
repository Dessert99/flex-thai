/** concept query·command와 media signer를 strict 공개 응답으로 조립한다 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  adminConceptDetailResponseSchema,
  adminConceptListResponseSchema,
  conceptDetailResponseSchema,
  conceptListResponseSchema,
  conceptValidationReportSchema,
  conceptVersionResponseSchema,
  type AdminConceptDetailResponse,
  type AdminConceptListQuery,
  type AdminConceptListResponse,
  type AdminConceptVersion,
  type ConceptCategory,
  type ConceptDetailResponse,
  type ConceptListResponse,
  type ConceptValidationReport,
  type CreateConceptRequest,
  type ReplaceConceptVersionRequest,
} from '@flex-thia/contracts';
import {
  ConceptPersistenceError,
  type ConceptSentenceProjection,
  type DrizzleAdminConceptQuery,
  type DrizzleLearnerConceptQuery,
  type LearnerConceptBlockProjection,
} from '@flex-thia/database';
import {
  ConceptDomainError,
  type ConceptCommandContext,
  type ConceptDraftRecord,
  type ConceptService,
  type MediaReadUrlProvider,
} from '@flex-thia/domain';
import type { ZodType } from 'zod';

const MEDIA_URL_TTL_MS = 5 * 60 * 1_000;

type LearnerQuery = Pick<
  DrizzleLearnerConceptQuery,
  'findPublishedDetail' | 'list'
>;
type AdminQuery = Pick<DrizzleAdminConceptQuery, 'findDetail' | 'list'>;

/** ConceptsService 조립 의존성 */
export interface ConceptsServiceDependencies {
  learnerQuery: LearnerQuery;
  adminQuery: AdminQuery;
  adminService: ConceptService;
  mediaReadUrls: MediaReadUrlProvider;
  now?: () => Date;
}

/** 내부 projection이 공개 계약과 다름을 숨긴 stable 오류 */
export class ConceptPublicResponseError extends Error {
  constructor() {
    super('CONCEPT_PUBLIC_RESPONSE_INVALID');
    this.name = 'ConceptPublicResponseError';
  }
}

const parsePublic = <Output>(
  schema: ZodType<Output>,
  value: unknown,
): Output => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ConceptPublicResponseError();
  return parsed.data;
};

const withConceptHttpErrors = async <Output>(
  work: () => Promise<Output>,
): Promise<Output> => {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof ConceptDomainError ||
      error instanceof ConceptPersistenceError
    ) {
      if (
        error.code === 'CONCEPT_NOT_FOUND' ||
        error.code === 'CONCEPT_VERSION_NOT_FOUND' ||
        error.code === 'CONCEPT_REFERENCE_NOT_FOUND'
      ) {
        throw new NotFoundException({ code: error.code });
      }
      throw new ConflictException({ code: error.code });
    }
    throw error;
  }
};

const mapSentence = async (
  sentence: ConceptSentenceProjection,
  sign: (storageKey: string) => Promise<string>,
) => {
  const mapFeedback = async <
    Feedback extends { media: { storageKey: string } },
  >({
    media,
    ...feedback
  }: Feedback) => ({
    ...feedback,
    audioUrl: await sign(media.storageKey),
  });
  return {
    sentenceVersionId: sentence.sentenceVersionId,
    originalText: sentence.originalText,
    translationKo: sentence.translationKo,
    pronunciationKo: sentence.pronunciationKo,
    toneMarks: sentence.toneMarks,
    audioUrl: await sign(sentence.media.storageKey),
    tokens: await Promise.all(sentence.tokens.map(mapFeedback)),
    expressions: await Promise.all(sentence.expressions.map(mapFeedback)),
  };
};

const mapBlocks = (
  blocks: LearnerConceptBlockProjection[],
  sign: (storageKey: string) => Promise<string>,
) =>
  Promise.all(
    blocks.map(async (block) =>
      block.kind !== 'THAI_EXAMPLES'
        ? block
        : {
            ...block,
            examples: await Promise.all(
              block.examples.map(async (example) => ({
                position: example.position,
                noteKo: example.noteKo,
                sentence: await mapSentence(example.sentence, sign),
              })),
            ),
          },
    ),
  );

const toPublicVersion = (record: ConceptDraftRecord): AdminConceptVersion => ({
  id: record.id,
  conceptId: record.conceptId,
  version: record.version,
  revision: record.revision,
  category: record.category,
  position: record.position,
  title: record.title,
  summary: record.summary,
  status: record.status,
  validationStatus: record.validationStatus,
  validationIssues: [],
  validatedAt: null,
  publishedAt: null,
  blocks: record.blocks.map((block) =>
    block.kind !== 'THAI_EXAMPLES'
      ? block
      : {
          id: block.id,
          kind: block.kind,
          position: block.position,
          heading: block.heading,
          examples: block.examples.map(
            ({ position, sentenceVersionId, noteKo }) => ({
              position,
              sentenceVersionId,
              noteKo,
            }),
          ),
        },
  ),
});

/** 개념 학습자·관리자 HTTP facade */
export class ConceptsService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: ConceptsServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** 영역별 게시 개념 목록을 반환한다 */
  async listPublished(category: ConceptCategory): Promise<ConceptListResponse> {
    return parsePublic(conceptListResponseSchema, {
      items: await this.dependencies.learnerQuery.list(category),
    });
  }

  /** 게시 개념 상세의 private media를 5분 URL로 바꾼다 */
  async getPublishedDetail(conceptId: string): Promise<ConceptDetailResponse> {
    const detail =
      await this.dependencies.learnerQuery.findPublishedDetail(conceptId);
    if (!detail) throw new NotFoundException({ code: 'CONCEPT_NOT_FOUND' });
    const expiresAt = new Date(this.now().getTime() + MEDIA_URL_TTL_MS);
    const cache = new Map<string, Promise<string>>();
    const sign = (storageKey: string) => {
      const existing = cache.get(storageKey);
      if (existing) return existing;
      const pending = this.dependencies.mediaReadUrls.createReadUrl(
        storageKey,
        expiresAt,
      );
      cache.set(storageKey, pending);
      return pending;
    };
    return parsePublic(conceptDetailResponseSchema, {
      ...detail,
      blocks: await mapBlocks(detail.blocks, sign),
    });
  }

  /** 모든 상태의 관리자 개념 목록을 반환한다 */
  async listAdmin(
    query: AdminConceptListQuery,
  ): Promise<AdminConceptListResponse> {
    const filter = {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    return parsePublic(
      adminConceptListResponseSchema,
      await this.dependencies.adminQuery.list(filter),
    );
  }

  /** 모든 버전을 포함한 관리자 개념 상세를 반환한다 */
  async getAdminDetail(conceptId: string): Promise<AdminConceptDetailResponse> {
    const detail = await this.dependencies.adminQuery.findDetail(conceptId);
    if (!detail) throw new NotFoundException({ code: 'CONCEPT_NOT_FOUND' });
    return parsePublic(adminConceptDetailResponseSchema, {
      ...detail,
      versions: detail.versions.map((version) => ({
        ...version,
        validatedAt: version.validatedAt?.toISOString() ?? null,
        publishedAt: version.publishedAt?.toISOString() ?? null,
      })),
    });
  }

  /** 논리 개념과 첫 초안을 생성한다 */
  async create(
    input: CreateConceptRequest,
    context: ConceptCommandContext,
  ): Promise<AdminConceptVersion> {
    return withConceptHttpErrors(async () =>
      parsePublic(
        conceptVersionResponseSchema,
        toPublicVersion(
          await this.dependencies.adminService.createConcept(input, context),
        ),
      ),
    );
  }

  /** 최신 버전에서 새 초안을 복제한다 */
  async createNextDraft(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<AdminConceptVersion> {
    return withConceptHttpErrors(async () =>
      parsePublic(
        conceptVersionResponseSchema,
        toPublicVersion(
          await this.dependencies.adminService.createNextDraft(
            conceptId,
            context,
          ),
        ),
      ),
    );
  }

  /** revision 기반으로 초안 전체를 교체한다 */
  async replace(
    versionId: string,
    input: ReplaceConceptVersionRequest,
    context: ConceptCommandContext,
  ): Promise<AdminConceptVersion> {
    return withConceptHttpErrors(async () =>
      parsePublic(
        conceptVersionResponseSchema,
        toPublicVersion(
          await this.dependencies.adminService.replaceDraft(
            versionId,
            input,
            context,
          ),
        ),
      ),
    );
  }

  /** 최신 초안을 검증한다 */
  async validate(
    versionId: string,
    context: ConceptCommandContext,
  ): Promise<ConceptValidationReport> {
    return withConceptHttpErrors(async () => {
      const report = await this.dependencies.adminService.validateVersion(
        versionId,
        context,
      );
      return parsePublic(conceptValidationReportSchema, {
        ...report,
        validatedAt: report.validatedAt.toISOString(),
      });
    });
  }

  /** 관리자 상세에서 revision을 확인해 검증된 초안을 게시한다 */
  async publish(
    versionId: string,
    context: ConceptCommandContext,
  ): Promise<void> {
    await withConceptHttpErrors(() =>
      this.dependencies.adminService.publishVersion(versionId, context),
    );
  }

  /** 게시 개념을 숨긴다 */
  hide(conceptId: string, context: ConceptCommandContext): Promise<void> {
    return withConceptHttpErrors(() =>
      this.dependencies.adminService.hideConcept(conceptId, context),
    );
  }

  /** 숨김 개념을 복구한다 */
  restore(conceptId: string, context: ConceptCommandContext): Promise<void> {
    return withConceptHttpErrors(() =>
      this.dependencies.adminService.restoreConcept(conceptId, context),
    );
  }
}

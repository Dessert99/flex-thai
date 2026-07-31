/** AI 어휘 후보 read model과 검수 command를 strict 공개 계약으로 조립한다 */
import { Injectable } from '@nestjs/common';
import {
  vocabularyCandidateApproveResponseSchema,
  vocabularyCandidateDetailResponseSchema,
  vocabularyCandidateDiscardResponseSchema,
  vocabularyCandidateListResponseSchema,
  type VocabularyCandidateApproveRequest,
  type VocabularyCandidateDiscardRequest,
  type VocabularyCandidateListQuery,
} from '@flex-thia/contracts';
import type {
  ApproveVocabularyCandidateInput,
  DiscardVocabularyCandidateInput,
  VocabularyCandidateApprovalResult,
  VocabularyCandidateDiscardResult,
  VocabularyCandidateQuery,
} from '@flex-thia/domain';
import type { ZodType } from 'zod';

/** domain 검수 service가 API 계층에 제공할 구조적 port */
export interface VocabularyCandidateReviewOperations {
  approve(
    input: ApproveVocabularyCandidateInput,
  ): Promise<VocabularyCandidateApprovalResult>;
  discard(
    input: DiscardVocabularyCandidateInput,
  ): Promise<VocabularyCandidateDiscardResult>;
}

/** 인증 guard가 확정한 관리자 감사 문맥 */
export interface VocabularyCandidateActorContext {
  userId: string;
  sub: string;
}

/** 후보 조회에서 식별자가 없을 때 노출하는 stable application 오류 */
export class VocabularyCandidateApplicationError extends Error {
  constructor(readonly code: 'VOCABULARY_CANDIDATE_NOT_FOUND') {
    super(code);
    this.name = 'VocabularyCandidateApplicationError';
  }
}

/** 내부 row가 공개 계약을 위반할 때 private 값을 버린 채 fail-closed한다 */
export class VocabularyCandidatePublicResponseError extends Error {
  constructor() {
    super('VOCABULARY_CANDIDATE_PUBLIC_RESPONSE_INVALID');
    this.name = 'VocabularyCandidatePublicResponseError';
  }
}

const parsePublicResponse = <Output>(
  schema: ZodType<Output>,
  value: unknown,
): Output => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new VocabularyCandidatePublicResponseError();
  return parsed.data;
};

const toCandidate = (
  candidate: Awaited<
    ReturnType<VocabularyCandidateQuery['list']>
  >['items'][number],
) => ({
  id: candidate.id,
  jobId: candidate.jobId,
  jobItemId: candidate.jobItemId,
  jobAttempt: candidate.jobAttempt,
  ordinal: candidate.ordinal,
  thai: candidate.thai,
  kind: candidate.kind,
  meanings: candidate.meanings,
  classification: candidate.classification,
  resultGroup: candidate.resultGroup,
  matchedVocabularyId: candidate.matchedVocabularyId,
  suspectedMatches: candidate.suspectedMatches,
  review: {
    status: candidate.reviewStatus,
    revision: candidate.revision,
    resolution: candidate.resolution,
  },
  createdAt: candidate.createdAt.toISOString(),
  updatedAt: candidate.updatedAt.toISOString(),
});

const toContext = (
  actor: VocabularyCandidateActorContext,
  candidateId: string,
  request: {
    expectedRevision: number;
    requestId: string;
  },
  occurredAt: Date,
) => ({
  candidateId,
  expectedRevision: request.expectedRevision,
  actorUserId: actor.userId,
  actorSub: actor.sub,
  requestId: request.requestId,
  occurredAt,
});

/** 후보 목록·상세와 검수 결과를 private field 없는 응답으로 제한한다 */
@Injectable()
export class VocabularyCandidateApplicationService {
  constructor(
    private readonly candidates: VocabularyCandidateQuery,
    private readonly review: VocabularyCandidateReviewOperations,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 상태·job filter의 후보 summary page를 반환한다 */
  async list(query: VocabularyCandidateListQuery) {
    const result = await this.candidates.list(query);
    return parsePublicResponse(vocabularyCandidateListResponseSchema, {
      items: result.items.map(toCandidate),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages:
          result.totalItems === 0
            ? 0
            : Math.ceil(result.totalItems / query.pageSize),
      },
    });
  }

  /** 후보 snapshot과 allow-list validation만 상세로 반환한다 */
  async get(candidateId: string) {
    const detail = await this.candidates.findById(candidateId);
    if (!detail) {
      throw new VocabularyCandidateApplicationError(
        'VOCABULARY_CANDIDATE_NOT_FOUND',
      );
    }
    return parsePublicResponse(vocabularyCandidateDetailResponseSchema, {
      candidate: toCandidate(detail.candidate),
      validations: detail.validations.map((validation) => ({
        stage: validation.stage,
        status: validation.status,
        code: validation.code,
        // provider 원문·key·run ID를 공개 evidence로 승격하지 않는다.
        evidence: {},
        createdAt: validation.createdAt.toISOString(),
      })),
    });
  }

  /** action별 승인 요청을 actor·서버 시각이 포함된 domain command로 바꾼다 */
  async approve(
    actor: VocabularyCandidateActorContext,
    candidateId: string,
    request: VocabularyCandidateApproveRequest,
  ) {
    const context = toContext(actor, candidateId, request, this.now());
    const result =
      request.action === 'LINK_EXISTING'
        ? await this.review.approve({
            ...context,
            action: 'LINK_EXISTING',
            vocabularyId: request.vocabularyId,
          })
        : await this.review.approve({
            ...context,
            action: 'CREATE_DRAFT',
            draft: {
              thai: request.thai,
              kind: request.kind,
              meanings: request.meanings.map((meaning) => ({
                ...meaning,
                contextNote: meaning.contextNote ?? null,
              })),
              pronunciations: request.pronunciations,
              meaningPronunciations: request.meaningPronunciations,
            },
            ...(request.confirmDuplicate
              ? { confirmDuplicate: true as const }
              : {}),
          });
    return parsePublicResponse(
      vocabularyCandidateApproveResponseSchema,
      result,
    );
  }

  /** 폐기 요청에 actor·서버 시각을 더해 terminal 응답을 반환한다 */
  async discard(
    actor: VocabularyCandidateActorContext,
    candidateId: string,
    request: VocabularyCandidateDiscardRequest,
  ) {
    const result = await this.review.discard(
      toContext(actor, candidateId, request, this.now()),
    );
    return parsePublicResponse(
      vocabularyCandidateDiscardResponseSchema,
      result,
    );
  }
}

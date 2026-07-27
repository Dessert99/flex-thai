/** AI 문제 후보 read model과 검수 명령을 strict 공개 계약으로 조립한다 */
import { Injectable } from '@nestjs/common';
import {
  approveQuestionCandidateResponseSchema,
  questionCandidateDetailResponseSchema,
  questionCandidateListResponseSchema,
  questionCandidateValidationEvidenceSchema,
  regenerateQuestionCandidateResponseSchema,
  type ApproveQuestionCandidateRequest,
  type DiscardQuestionCandidateRequest,
  type QuestionCandidateListQuery,
  type RegenerateQuestionCandidateRequest,
} from '@flex-thia/contracts';
import type { ZodType } from 'zod';

type CandidateGroup = 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';
type CandidateReviewStatus = 'PENDING' | 'APPROVED' | 'DISCARDED';
type ValidationStage =
  'SCHEMA' | 'DECISION_RULE' | 'SIMILARITY' | 'AI_CROSS_VALIDATION';
type ValidationStatus = 'PASSED' | 'FAILED' | 'SKIPPED';

/** DB candidate row에서 API projection에 필요한 필드만 나타낸다 */
export interface QuestionCandidateReadRecord {
  id: string;
  jobItemId: string;
  jobAttempt: number;
  ordinal: number;
  questionTypeVersionId: string;
  topicId: string;
  tagIds: string[];
  difficulty: number;
  payload: unknown;
  resultGroup: CandidateGroup;
  reviewStatus: CandidateReviewStatus;
  reviewCode: string | null;
  regeneratedFromCandidateId: string | null;
  approvedQuestionId: string | null;
  approvedQuestionVersionId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 저장된 validation details를 공개하기 전 service가 받는 내부 row */
export interface QuestionCandidateValidationReadRecord {
  stage: ValidationStage;
  status: ValidationStatus;
  code: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

/** 후보 graph와 네 검증 단계의 내부 상세 조회 결과 */
export interface QuestionCandidateReadDetail {
  candidate: QuestionCandidateReadRecord;
  validations: QuestionCandidateValidationReadRecord[];
}

/** 통합 module이 실제 Drizzle read adapter로 제공할 후보 조회 port */
export interface QuestionCandidateReadRepository {
  list(input: QuestionCandidateListQuery): Promise<{
    items: QuestionCandidateReadRecord[];
    totalItems: number;
  }>;
  findById(candidateId: string): Promise<QuestionCandidateReadDetail | null>;
}

/** Task 6 domain service를 root barrel 없이 받는 구조적 검수 port */
export interface QuestionCandidateReviewOperations {
  approve(input: QuestionCandidateReviewCommand): Promise<{
    questionId: string;
    questionVersionId: string;
  }>;
  discard(input: QuestionCandidateReviewCommand): Promise<void>;
  regenerate(input: QuestionCandidateReviewCommand): Promise<{
    jobId: string;
    attempt: number;
  }>;
}

/** 인증 guard와 request decorator가 확정한 관리자 문맥 */
export interface QuestionCandidateActorContext {
  userId: string;
  sub: string;
}

/** domain 검수 port에 전달하는 위조 불가능한 감사 명령 */
export interface QuestionCandidateReviewCommand {
  candidateId: string;
  expectedRevision: number;
  actorUserId: string;
  actorSub: string;
  requestId: string;
  occurredAt: Date;
}

/** 후보 조회에서 식별자가 없을 때 노출하는 stable application 오류 */
export class QuestionCandidateApplicationError extends Error {
  constructor(readonly code: 'QUESTION_CANDIDATE_NOT_FOUND') {
    super(code);
    this.name = 'QuestionCandidateApplicationError';
  }
}

/** 내부 row가 공개 계약을 위반해 private 구조가 validation 오류로 새지 않게 한다 */
export class QuestionCandidatePublicResponseError extends Error {
  constructor() {
    super('QUESTION_CANDIDATE_PUBLIC_RESPONSE_INVALID');
    this.name = 'QuestionCandidatePublicResponseError';
  }
}

const parsePublicResponse = <Output>(
  schema: ZodType<Output>,
  value: unknown,
): Output => {
  const result = schema.safeParse(value);
  if (!result.success) throw new QuestionCandidatePublicResponseError();
  return result.data;
};

const toReview = (candidate: QuestionCandidateReadRecord) => ({
  status: candidate.reviewStatus,
  code: candidate.reviewCode,
  revision: candidate.revision,
  regeneratedFromCandidateId: candidate.regeneratedFromCandidateId,
  approvedQuestionId: candidate.approvedQuestionId,
  approvedQuestionVersionId: candidate.approvedQuestionVersionId,
});

const toSummary = (candidate: QuestionCandidateReadRecord) => ({
  id: candidate.id,
  jobItemId: candidate.jobItemId,
  jobAttempt: candidate.jobAttempt,
  ordinal: candidate.ordinal,
  questionTypeVersionId: candidate.questionTypeVersionId,
  topicId: candidate.topicId,
  difficulty: candidate.difficulty,
  resultGroup: candidate.resultGroup,
  review: toReview(candidate),
  createdAt: candidate.createdAt.toISOString(),
  updatedAt: candidate.updatedAt.toISOString(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const similarityEvidence = (details: Record<string, unknown>) => {
  if (!Array.isArray(details['matches'])) return { kind: 'NONE' } as const;
  const matches = details['matches'].flatMap((match) => {
    if (!isRecord(match)) return [];
    const projected = {
      questionVersionId: match['questionVersionId'],
      score: match['score'],
    };
    const parsed = questionCandidateValidationEvidenceSchema.safeParse({
      kind: 'SIMILARITY_MATCHES',
      matches: [projected],
    });
    return parsed.success && parsed.data.kind === 'SIMILARITY_MATCHES'
      ? [parsed.data.matches[0]!]
      : [];
  });
  return matches.length > 0
    ? ({ kind: 'SIMILARITY_MATCHES', matches } as const)
    : ({ kind: 'NONE' } as const);
};

const crossValidationEvidence = (details: Record<string, unknown>) => {
  if (details['retryable'] === true) {
    return { kind: 'RETRYABLE_PROVIDER_FAILURE', retryable: true } as const;
  }
  const evidence = details['evidence'];
  const summary = isRecord(evidence) ? evidence['summary'] : undefined;
  const parsed = questionCandidateValidationEvidenceSchema.safeParse({
    kind: 'CROSS_VALIDATION',
    summary,
  });
  return parsed.success ? parsed.data : ({ kind: 'NONE' } as const);
};

const toValidationEvidence = (
  validation: QuestionCandidateValidationReadRecord,
) => {
  if (validation.status === 'SKIPPED') return { kind: 'NONE' } as const;
  if (validation.stage === 'SIMILARITY') {
    return validation.status === 'FAILED'
      ? similarityEvidence(validation.details)
      : ({ kind: 'NONE' } as const);
  }
  if (validation.stage === 'AI_CROSS_VALIDATION') {
    return crossValidationEvidence(validation.details);
  }
  return { kind: 'NONE' } as const;
};

const toReviewCommand = (
  actor: QuestionCandidateActorContext,
  candidateId: string,
  expectedRevision: number,
  requestId: string,
  occurredAt: Date,
): QuestionCandidateReviewCommand => ({
  candidateId,
  expectedRevision,
  actorUserId: actor.userId,
  actorSub: actor.sub,
  // 검증된 body UUID는 replay key이고 actor·시각만 서버 문맥에서 조립한다.
  requestId,
  occurredAt,
});

/** 후보 조회와 검수 명령을 API 공개 응답으로 제한한다 */
@Injectable()
export class QuestionCandidateApplicationService {
  constructor(
    private readonly candidates: QuestionCandidateReadRepository,
    private readonly review: QuestionCandidateReviewOperations,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** private payload 없는 후보 summary page를 반환한다 */
  async list(query: QuestionCandidateListQuery) {
    const result = await this.candidates.list(query);
    return parsePublicResponse(questionCandidateListResponseSchema, {
      items: result.items.map(toSummary),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    });
  }

  /** canonical payload와 allow-list 검증 evidence만 반환한다 */
  async get(candidateId: string) {
    const detail = await this.requireCandidate(candidateId);
    return parsePublicResponse(questionCandidateDetailResponseSchema, {
      candidate: {
        ...toSummary(detail.candidate),
        tagIds: detail.candidate.tagIds,
        payload: detail.candidate.payload,
      },
      validations: detail.validations.map((validation) => ({
        stage: validation.stage,
        status: validation.status,
        code: validation.code,
        evidence: toValidationEvidence(validation),
        createdAt: validation.createdAt.toISOString(),
      })),
    });
  }

  /** 후보를 승인하고 동일 요청 replay에도 같은 DRAFT 응답을 반환한다 */
  async approve(
    actor: QuestionCandidateActorContext,
    candidateId: string,
    request: ApproveQuestionCandidateRequest,
  ) {
    await this.requireCandidate(candidateId);
    const draft = await this.review.approve(
      toReviewCommand(
        actor,
        candidateId,
        request.expectedRevision,
        request.requestId,
        this.now(),
      ),
    );
    return parsePublicResponse(approveQuestionCandidateResponseSchema, {
      candidateId,
      review: {
        status: 'APPROVED',
        revision: request.expectedRevision + 1,
        questionId: draft.questionId,
        questionVersionId: draft.questionVersionId,
      },
    });
  }

  /** PENDING 후보를 terminal 폐기하고 응답 본문은 만들지 않는다 */
  async discard(
    actor: QuestionCandidateActorContext,
    candidateId: string,
    request: DiscardQuestionCandidateRequest,
  ): Promise<void> {
    await this.requireCandidate(candidateId);
    await this.review.discard(
      toReviewCommand(
        actor,
        candidateId,
        request.expectedRevision,
        request.requestId,
        this.now(),
      ),
    );
  }

  /** 원본 후보를 보존한 새 attempt 접수 결과를 반환한다 */
  async regenerate(
    actor: QuestionCandidateActorContext,
    candidateId: string,
    request: RegenerateQuestionCandidateRequest,
  ) {
    await this.requireCandidate(candidateId);
    const result = await this.review.regenerate(
      toReviewCommand(
        actor,
        candidateId,
        request.expectedRevision,
        request.requestId,
        this.now(),
      ),
    );
    return parsePublicResponse(regenerateQuestionCandidateResponseSchema, {
      candidateId,
      jobId: result.jobId,
      attempt: result.attempt,
      revision: request.expectedRevision + 1,
    });
  }

  private async requireCandidate(
    candidateId: string,
  ): Promise<QuestionCandidateReadDetail> {
    const candidate = await this.candidates.findById(candidateId);
    if (!candidate) {
      throw new QuestionCandidateApplicationError(
        'QUESTION_CANDIDATE_NOT_FOUND',
      );
    }
    return candidate;
  }
}

/** AI 어휘 후보의 optimistic 검수 규칙과 저장 port를 정의한다 */
import type {
  VocabularyDuplicateClassification,
  VocabularyProductionCandidateRecord,
  VocabularyProductionValidationRecord,
} from './ai-vocabulary-production.js';

/** 후보 검수 lifecycle 상태 */
export type VocabularyCandidateReviewStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DISCARDED';

/** 후보 검수 전이에 필요한 잠금 상태 */
export interface VocabularyCandidateReviewState {
  candidateId: string;
  classification: VocabularyDuplicateClassification;
  reviewStatus: VocabularyCandidateReviewStatus;
  revision: number;
}

/** 새 DRAFT 뜻 graph 입력 */
export interface VocabularyCandidateMeaningInput {
  clientRef: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number;
  contextNote: string | null;
}

/** 새 DRAFT 발음 graph 입력 */
export interface VocabularyCandidatePronunciationInput {
  clientRef: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
}

/** 새 DRAFT 뜻·발음 연결 입력 */
export interface VocabularyCandidateMeaningPronunciationInput {
  meaningRef: string;
  pronunciationRef: string;
}

/** 새 DRAFT로 materialize할 완전한 어휘 graph */
export interface VocabularyCandidateDraftGraph {
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: VocabularyCandidateMeaningInput[];
  pronunciations: VocabularyCandidatePronunciationInput[];
  meaningPronunciations: VocabularyCandidateMeaningPronunciationInput[];
}

/** 후보 검수의 서버 소유 감사 문맥 */
export interface VocabularyCandidateReviewContext {
  candidateId: string;
  expectedRevision: number;
  actorUserId: string;
  actorSub: string;
  requestId: string;
  occurredAt: Date;
}

/** 후보를 DRAFT 생성 또는 기존 어휘 연결로 승인하는 명령 */
export type ApproveVocabularyCandidateInput =
  | (VocabularyCandidateReviewContext & {
      action: 'CREATE_DRAFT';
      draft: VocabularyCandidateDraftGraph;
      confirmDuplicate?: true | undefined;
    })
  | (VocabularyCandidateReviewContext & {
      action: 'LINK_EXISTING';
      vocabularyId: string;
    });

/** 후보 폐기 명령 */
export type DiscardVocabularyCandidateInput = VocabularyCandidateReviewContext;

/** 후보 승인 뒤 고정되는 terminal resolution */
export type VocabularyCandidateApprovalResult = {
  candidateId: string;
  reviewStatus: 'APPROVED';
  revision: number;
  resolution:
    | { kind: 'DRAFT_CREATED'; vocabularyId: string; versionId: string }
    | { kind: 'EXISTING_LINKED'; vocabularyId: string };
};

/** 후보 폐기 뒤 고정되는 terminal 결과 */
export interface VocabularyCandidateDiscardResult {
  candidateId: string;
  reviewStatus: 'DISCARDED';
  revision: number;
}

/** 검수 실패를 API와 저장 adapter가 stable code로 공유하게 한다 */
export class VocabularyCandidateReviewError extends Error {
  constructor(
    readonly code:
      | 'VOCABULARY_CANDIDATE_NOT_FOUND'
      | 'VOCABULARY_CANDIDATE_NOT_APPROVABLE'
      | 'VOCABULARY_CANDIDATE_DUPLICATE_CONFIRMATION_REQUIRED'
      | 'VOCABULARY_CANDIDATE_IDEMPOTENCY_CONFLICT'
      | 'VOCABULARY_CANDIDATE_REVIEW_CONFLICT'
      | 'VOCABULARY_CANDIDATE_EXISTING_VOCABULARY_NOT_FOUND'
      | 'VOCABULARY_CANDIDATE_AUDIO_NOT_READY',
  ) {
    super(code);
    this.name = 'VocabularyCandidateReviewError';
  }
}

const assertPendingRevision = (
  state: VocabularyCandidateReviewState,
  expectedRevision: number,
) => {
  if (
    state.reviewStatus !== 'PENDING' ||
    state.revision !== expectedRevision
  ) {
    throw new VocabularyCandidateReviewError(
      'VOCABULARY_CANDIDATE_REVIEW_CONFLICT',
    );
  }
};

/** 잠근 후보가 승인 가능한 PENDING revision과 중복 확인을 만족하는지 검증한다 */
export const assertVocabularyCandidateApproval = (
  state: VocabularyCandidateReviewState,
  command: ApproveVocabularyCandidateInput,
): void => {
  assertPendingRevision(state, command.expectedRevision);
  if (
    command.action === 'CREATE_DRAFT' &&
    state.classification !== 'NEW_VOCABULARY' &&
    command.confirmDuplicate !== true
  ) {
    throw new VocabularyCandidateReviewError(
      'VOCABULARY_CANDIDATE_DUPLICATE_CONFIRMATION_REQUIRED',
    );
  }
};

/** 잠근 후보가 폐기 가능한 PENDING revision인지 검증한다 */
export const assertVocabularyCandidateDiscard = (
  state: VocabularyCandidateReviewState,
  command: DiscardVocabularyCandidateInput,
): void => {
  assertPendingRevision(state, command.expectedRevision);
};

type ApprovalRepositoryOutcome =
  | { kind: 'APPLIED'; result: VocabularyCandidateApprovalResult }
  | { kind: 'REPLAY'; result: VocabularyCandidateApprovalResult }
  | {
      kind:
        | 'NOT_FOUND'
        | 'NOT_APPROVABLE'
        | 'DUPLICATE_CONFIRMATION_REQUIRED'
        | 'IDEMPOTENCY_CONFLICT'
        | 'REVIEW_CONFLICT'
        | 'EXISTING_VOCABULARY_NOT_FOUND'
        | 'AUDIO_NOT_READY';
    };

type DiscardRepositoryOutcome =
  | { kind: 'APPLIED'; result: VocabularyCandidateDiscardResult }
  | { kind: 'REPLAY'; result: VocabularyCandidateDiscardResult }
  | {
      kind:
        | 'NOT_FOUND'
        | 'IDEMPOTENCY_CONFLICT'
        | 'REVIEW_CONFLICT';
    };

/** 후보 승인·폐기의 transaction 결과만 도메인에 전달하는 저장 port */
export interface VocabularyCandidateReviewRepository {
  approve(
    input: ApproveVocabularyCandidateInput,
  ): Promise<ApprovalRepositoryOutcome>;
  discard(
    input: DiscardVocabularyCandidateInput,
  ): Promise<DiscardRepositoryOutcome>;
}

/** 목록 조회에 필요한 공개 가능한 후보 저장 snapshot */
export interface VocabularyCandidateReadRecord
  extends VocabularyProductionCandidateRecord {
  id: string;
  jobId: string;
  jobItemId: string;
  jobAttempt: number;
  reviewStatus: VocabularyCandidateReviewStatus;
  revision: number;
  resolution: VocabularyCandidateApprovalResult['resolution'] | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 후보와 ordinal validation을 함께 반환하는 상세 read model */
export interface VocabularyCandidateReadDetail {
  candidate: VocabularyCandidateReadRecord;
  validations: Array<VocabularyProductionValidationRecord & { createdAt: Date }>;
}

/** 후보 목록·상세의 DB read adapter port */
export interface VocabularyCandidateQuery {
  list(input: {
    jobId?: string | undefined;
    reviewStatus?: VocabularyCandidateReviewStatus | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ items: VocabularyCandidateReadRecord[]; totalItems: number }>;
  findById(candidateId: string): Promise<VocabularyCandidateReadDetail | null>;
}

const reviewErrorByOutcome = (
  outcome:
    | Exclude<ApprovalRepositoryOutcome, { kind: 'APPLIED' | 'REPLAY' }>
    | Exclude<DiscardRepositoryOutcome, { kind: 'APPLIED' | 'REPLAY' }>,
): VocabularyCandidateReviewError => {
  const code = {
    NOT_FOUND: 'VOCABULARY_CANDIDATE_NOT_FOUND',
    NOT_APPROVABLE: 'VOCABULARY_CANDIDATE_NOT_APPROVABLE',
    DUPLICATE_CONFIRMATION_REQUIRED:
      'VOCABULARY_CANDIDATE_DUPLICATE_CONFIRMATION_REQUIRED',
    IDEMPOTENCY_CONFLICT: 'VOCABULARY_CANDIDATE_IDEMPOTENCY_CONFLICT',
    REVIEW_CONFLICT: 'VOCABULARY_CANDIDATE_REVIEW_CONFLICT',
    EXISTING_VOCABULARY_NOT_FOUND:
      'VOCABULARY_CANDIDATE_EXISTING_VOCABULARY_NOT_FOUND',
    AUDIO_NOT_READY: 'VOCABULARY_CANDIDATE_AUDIO_NOT_READY',
  }[outcome.kind] as VocabularyCandidateReviewError['code'];
  return new VocabularyCandidateReviewError(code);
};

/** 저장소의 원자 결과를 replay-safe 공개 domain 결과로 정규화한다 */
export class VocabularyCandidateReviewService {
  constructor(private readonly repository: VocabularyCandidateReviewRepository) {}

  /** 첫 승인과 같은 request replay를 동일한 terminal resolution으로 반환한다 */
  async approve(
    input: ApproveVocabularyCandidateInput,
  ): Promise<VocabularyCandidateApprovalResult> {
    const outcome = await this.repository.approve(input);
    if (outcome.kind === 'APPLIED' || outcome.kind === 'REPLAY') {
      return outcome.result;
    }
    throw reviewErrorByOutcome(outcome);
  }

  /** 첫 폐기와 같은 request replay를 동일한 terminal 상태로 반환한다 */
  async discard(
    input: DiscardVocabularyCandidateInput,
  ): Promise<VocabularyCandidateDiscardResult> {
    const outcome = await this.repository.discard(input);
    if (outcome.kind === 'APPLIED' || outcome.kind === 'REPLAY') {
      return outcome.result;
    }
    throw reviewErrorByOutcome(outcome);
  }
}

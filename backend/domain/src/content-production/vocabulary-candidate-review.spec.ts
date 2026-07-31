import { describe, expect, it } from 'vitest';
import {
  assertVocabularyCandidateApproval,
  assertVocabularyCandidateDiscard,
  type VocabularyCandidateApprovalResult,
  type VocabularyCandidateReviewRepository,
  VocabularyCandidateReviewService,
} from './vocabulary-candidate-review.js';

const baseState = {
  candidateId: 'candidate-id',
  classification: 'NEW_VOCABULARY' as const,
  reviewStatus: 'PENDING' as const,
  revision: 3,
};

const context = {
  candidateId: 'candidate-id',
  expectedRevision: 3,
  actorUserId: 'actor-user-id',
  actorSub: 'actor-sub',
  requestId: 'request-id',
  occurredAt: new Date('2026-07-31T00:00:00.000Z'),
};

const createDraftCommand = {
  ...context,
  action: 'CREATE_DRAFT' as const,
  draft: {
    thai: 'สวัสดี',
    kind: 'WORD' as const,
    meanings: [
      {
        clientRef: 'meaning.greeting',
        meaningKo: '안녕하세요',
        partOfSpeech: '감탄사',
        difficulty: 1,
        contextNote: null,
      },
    ],
    pronunciations: [
      {
        clientRef: 'pronunciation.main',
        pronunciationKo: '싸왓디',
        toneMarks: 'L-L-M',
        mediaAssetId: 'media-id',
      },
    ],
    meaningPronunciations: [
      {
        meaningRef: 'meaning.greeting',
        pronunciationRef: 'pronunciation.main',
      },
    ],
  },
};

describe('AI 어휘 후보 검수 전이', () => {
  it('PENDING 후보의 현재 revision만 승인할 수 있다', () => {
    expect(() =>
      assertVocabularyCandidateApproval(baseState, createDraftCommand),
    ).not.toThrow();

    expect(() =>
      assertVocabularyCandidateApproval(
        { ...baseState, reviewStatus: 'APPROVED' },
        createDraftCommand,
      ),
    ).toThrow('VOCABULARY_CANDIDATE_REVIEW_CONFLICT');
    expect(() =>
      assertVocabularyCandidateApproval(baseState, {
        ...createDraftCommand,
        expectedRevision: 2,
      }),
    ).toThrow('VOCABULARY_CANDIDATE_REVIEW_CONFLICT');
  });

  it('NEW가 아닌 후보의 새 DRAFT 생성은 명시적 중복 확인을 요구한다', () => {
    expect(() =>
      assertVocabularyCandidateApproval(
        { ...baseState, classification: 'POSSIBLE_DUPLICATE' },
        createDraftCommand,
      ),
    ).toThrow('VOCABULARY_CANDIDATE_DUPLICATE_CONFIRMATION_REQUIRED');

    expect(() =>
      assertVocabularyCandidateApproval(
        { ...baseState, classification: 'EXACT_NEW_MEANING' },
        { ...createDraftCommand, confirmDuplicate: true },
      ),
    ).not.toThrow();
  });

  it('기존 어휘 연결은 중복 확인 없이 PENDING과 revision만 검사한다', () => {
    expect(() =>
      assertVocabularyCandidateApproval(baseState, {
        ...context,
        action: 'LINK_EXISTING',
        vocabularyId: 'vocabulary-id',
      }),
    ).not.toThrow();
  });

  it('폐기도 PENDING 후보의 현재 revision에서만 허용한다', () => {
    expect(() =>
      assertVocabularyCandidateDiscard(baseState, context),
    ).not.toThrow();
    expect(() =>
      assertVocabularyCandidateDiscard(
        { ...baseState, reviewStatus: 'DISCARDED' },
        context,
      ),
    ).toThrow('VOCABULARY_CANDIDATE_REVIEW_CONFLICT');
  });
});

describe('AI 어휘 후보 검수 서비스', () => {
  const result: VocabularyCandidateApprovalResult = {
    candidateId: 'candidate-id',
    reviewStatus: 'APPROVED',
    revision: 4,
    resolution: {
      kind: 'DRAFT_CREATED',
      vocabularyId: 'vocabulary-id',
    },
  };

  it('첫 승인과 같은 requestId replay를 같은 resolution으로 반환한다', async () => {
    const outcomes = [
      { kind: 'APPLIED' as const, result },
      { kind: 'REPLAY' as const, result },
    ];
    const repository: VocabularyCandidateReviewRepository = {
      approve: () => Promise.resolve(outcomes.shift()!),
      discard: () =>
        Promise.resolve({
          kind: 'APPLIED',
          result: {
            candidateId: 'candidate-id',
            reviewStatus: 'DISCARDED',
            revision: 4,
          },
        }),
    };
    const service = new VocabularyCandidateReviewService(repository);

    await expect(service.approve(createDraftCommand)).resolves.toEqual(result);
    await expect(service.approve(createDraftCommand)).resolves.toEqual(result);
  });

  it('다른 payload의 requestId 재사용과 동시 상태 변경을 stable 오류로 반환한다', async () => {
    const outcomes = [
      { kind: 'IDEMPOTENCY_CONFLICT' as const },
      { kind: 'REVIEW_CONFLICT' as const },
    ];
    const repository: VocabularyCandidateReviewRepository = {
      approve: () => Promise.resolve(outcomes.shift()!),
      discard: () => Promise.resolve({ kind: 'REVIEW_CONFLICT' }),
    };
    const service = new VocabularyCandidateReviewService(repository);

    await expect(service.approve(createDraftCommand)).rejects.toThrow(
      'VOCABULARY_CANDIDATE_IDEMPOTENCY_CONFLICT',
    );
    await expect(service.approve(createDraftCommand)).rejects.toThrow(
      'VOCABULARY_CANDIDATE_REVIEW_CONFLICT',
    );
    await expect(service.discard(context)).rejects.toThrow(
      'VOCABULARY_CANDIDATE_REVIEW_CONFLICT',
    );
  });
});

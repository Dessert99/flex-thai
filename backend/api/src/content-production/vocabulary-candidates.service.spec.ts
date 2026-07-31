import { describe, expect, it, vi } from 'vitest';
import {
  VocabularyCandidateApplicationError,
  VocabularyCandidateApplicationService,
  VocabularyCandidatePublicResponseError,
  type VocabularyCandidateReviewOperations,
} from './vocabulary-candidates.service.js';

const ids = {
  candidate: '00000000-0000-4000-8000-000000000001',
  job: '00000000-0000-4000-8000-000000000002',
  item: '00000000-0000-4000-8000-000000000003',
  request: '00000000-0000-4000-8000-000000000004',
  actor: '00000000-0000-4000-8000-000000000005',
  media: '00000000-0000-4000-8000-000000000006',
  vocabulary: '00000000-0000-4000-8000-000000000007',
} as const;

const candidate = {
  id: ids.candidate,
  jobId: ids.job,
  jobItemId: ids.item,
  jobAttempt: 1,
  ordinal: 0,
  thai: 'สวัสดี',
  normalizedThai: 'สวัสดี',
  kind: 'WORD' as const,
  meanings: [
    { meaningKo: '안녕하세요', partOfSpeech: '감탄사', difficulty: 1 },
  ],
  classification: 'NEW_VOCABULARY' as const,
  resultGroup: 'NORMAL' as const,
  matchedVocabularyId: null,
  suspectedMatches: [],
  reviewCode: null,
  reviewStatus: 'PENDING' as const,
  revision: 0,
  resolution: null,
  createdAt: new Date('2026-07-31T00:00:00.000Z'),
  updatedAt: new Date('2026-07-31T00:00:00.000Z'),
};

const occurredAt = new Date('2026-07-31T01:00:00.000Z');
const actor = { userId: ids.actor, sub: 'actor-sub' };
const createDraftRequest = {
  action: 'CREATE_DRAFT' as const,
  expectedRevision: 0,
  requestId: ids.request,
  thai: candidate.thai,
  kind: candidate.kind,
  meanings: [
    {
      clientRef: 'meaning.greeting',
      meaningKo: '안녕하세요',
      partOfSpeech: '감탄사',
      difficulty: 1,
    },
  ],
  pronunciations: [
    {
      clientRef: 'pronunciation.main',
      pronunciationKo: '싸왓디',
      toneMarks: 'L-L-M',
      mediaAssetId: ids.media,
    },
  ],
  meaningPronunciations: [
    {
      meaningRef: 'meaning.greeting',
      pronunciationRef: 'pronunciation.main',
    },
  ],
};

const createService = (found: typeof candidate | null = candidate) => {
  const query = {
    list: vi.fn().mockResolvedValue({
      items: [
        {
          ...candidate,
          providerRawPayload: { secret: true },
          privateInputKey: 'private/input.json',
        },
      ],
      totalItems: 1,
    }),
    findById: vi.fn().mockResolvedValue(
      found
        ? {
            candidate: found,
            validations: [
              {
                candidateOrdinal: 0,
                stage: 'SCHEMA',
                status: 'PASSED',
                code: null,
                details: {
                  providerRawPayload: { secret: true },
                  storageKey: 'private/audio.wav',
                },
                createdAt: new Date('2026-07-31T00:00:01.000Z'),
              },
            ],
          }
        : null,
    ),
  };
  const approveReview = vi.fn().mockResolvedValue({
    candidateId: ids.candidate,
    reviewStatus: 'APPROVED',
    revision: 1,
    resolution: {
      kind: 'DRAFT_CREATED',
      vocabularyId: ids.vocabulary,
    },
  });
  const discardReview = vi.fn().mockResolvedValue({
    candidateId: ids.candidate,
    reviewStatus: 'DISCARDED',
    revision: 1,
  });
  const review: VocabularyCandidateReviewOperations = {
    approve: approveReview,
    discard: discardReview,
  };
  return {
    approveReview,
    discardReview,
    query,
    service: new VocabularyCandidateApplicationService(
      query,
      review,
      () => occurredAt,
    ),
  };
};

describe('VocabularyCandidateApplicationService 공개 경계', () => {
  it('목록·상세를 private provider와 storage 값 없는 strict 응답으로 투영한다', async () => {
    const { service } = createService();

    const list = await service.list({
      reviewStatus: 'PENDING',
      page: 1,
      pageSize: 20,
    });
    const detail = await service.get(ids.candidate);

    expect(list.page).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    expect(detail.validations).toEqual([
      {
        stage: 'SCHEMA',
        status: 'PASSED',
        code: null,
        evidence: {},
        createdAt: '2026-07-31T00:00:01.000Z',
      },
    ]);
    const serialized = JSON.stringify({ list, detail });
    expect(serialized).not.toContain('providerRawPayload');
    expect(serialized).not.toContain('privateInputKey');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('normalizedThai');
  });

  it('CREATE_DRAFT 전체 graph와 actor·서버 시각을 domain command로 전달한다', async () => {
    const { approveReview, service } = createService();

    await expect(
      service.approve(actor, ids.candidate, createDraftRequest),
    ).resolves.toMatchObject({
      candidateId: ids.candidate,
      resolution: { kind: 'DRAFT_CREATED', vocabularyId: ids.vocabulary },
    });
    expect(approveReview).toHaveBeenCalledWith({
      candidateId: ids.candidate,
      expectedRevision: 0,
      actorUserId: ids.actor,
      actorSub: actor.sub,
      requestId: ids.request,
      occurredAt,
      action: 'CREATE_DRAFT',
      draft: {
        thai: candidate.thai,
        kind: candidate.kind,
        meanings: [
          {
            ...createDraftRequest.meanings[0],
            contextNote: null,
          },
        ],
        pronunciations: createDraftRequest.pronunciations,
        meaningPronunciations: createDraftRequest.meaningPronunciations,
      },
    });
  });

  it('LINK_EXISTING과 폐기는 graph를 만들지 않고 resolution command만 전달한다', async () => {
    const { approveReview, discardReview, service } = createService();

    await service.approve(actor, ids.candidate, {
      action: 'LINK_EXISTING',
      expectedRevision: 0,
      requestId: ids.request,
      vocabularyId: ids.vocabulary,
    });
    await service.discard(actor, ids.candidate, {
      expectedRevision: 0,
      requestId: ids.request,
    });

    expect(approveReview).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LINK_EXISTING',
        vocabularyId: ids.vocabulary,
      }),
    );
    expect(discardReview).toHaveBeenCalledWith({
      candidateId: ids.candidate,
      expectedRevision: 0,
      actorUserId: ids.actor,
      actorSub: actor.sub,
      requestId: ids.request,
      occurredAt,
    });
  });

  it('없는 후보 상세는 stable 404 application 오류로 거절한다', async () => {
    const { service } = createService(null);

    await expect(service.get(ids.candidate)).rejects.toEqual(
      new VocabularyCandidateApplicationError('VOCABULARY_CANDIDATE_NOT_FOUND'),
    );
  });

  it('승인 adapter가 legacy versionId를 남기면 strict 공개 응답을 거절한다', async () => {
    const { approveReview, service } = createService();
    approveReview.mockResolvedValue({
      candidateId: ids.candidate,
      reviewStatus: 'APPROVED',
      revision: 1,
      resolution: {
        kind: 'DRAFT_CREATED',
        vocabularyId: ids.vocabulary,
        versionId: ids.item,
      },
    });

    await expect(
      service.approve(actor, ids.candidate, createDraftRequest),
    ).rejects.toEqual(new VocabularyCandidatePublicResponseError());
  });
});

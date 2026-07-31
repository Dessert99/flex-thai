import { describe, expect, it } from 'vitest';
import {
  vocabularyCandidateApproveRequestSchema,
  vocabularyCandidateApproveResponseSchema,
  vocabularyCandidateDetailResponseSchema,
  vocabularyCandidateDiscardRequestSchema,
  vocabularyCandidateListQuerySchema,
} from './vocabulary-candidates.js';

const ids = {
  request: '00000000-0000-4000-8000-000000000001',
  vocabulary: '00000000-0000-4000-8000-000000000002',
  media: '00000000-0000-4000-8000-000000000003',
  candidate: '00000000-0000-4000-8000-000000000004',
  job: '00000000-0000-4000-8000-000000000005',
  item: '00000000-0000-4000-8000-000000000006',
} as const;

const createDraftRequest = {
  action: 'CREATE_DRAFT' as const,
  expectedRevision: 3,
  requestId: ids.request,
  thai: 'สวัสดี',
  kind: 'WORD' as const,
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

describe('AI 어휘 후보 공개 계약', () => {
  it('기존 어휘 연결 승인 요청을 action별 strict 입력으로 검증한다', () => {
    expect(
      vocabularyCandidateApproveRequestSchema.parse({
        action: 'LINK_EXISTING',
        expectedRevision: 3,
        requestId: ids.request,
        vocabularyId: ids.vocabulary,
      }),
    ).toMatchObject({ action: 'LINK_EXISTING' });

    expect(() =>
      vocabularyCandidateApproveRequestSchema.parse({
        action: 'LINK_EXISTING',
        expectedRevision: 3,
        requestId: ids.request,
        vocabularyId: ids.vocabulary,
        privateInputKey: 'private/input.json',
      }),
    ).toThrow();
  });

  it('새 DRAFT 승인은 뜻·발음·sealed media·완전한 mapping graph를 요구한다', () => {
    expect(
      vocabularyCandidateApproveRequestSchema.parse(createDraftRequest),
    ).toEqual(createDraftRequest);

    for (const patch of [
      { meanings: [] },
      { pronunciations: [] },
      { meaningPronunciations: [] },
      {
        pronunciations: [
          {
            ...createDraftRequest.pronunciations[0],
            mediaAssetId: 'not-a-uuid',
          },
        ],
      },
      {
        meaningPronunciations: [
          ...createDraftRequest.meaningPronunciations,
          ...createDraftRequest.meaningPronunciations,
        ],
      },
      {
        meanings: [
          ...createDraftRequest.meanings,
          { ...createDraftRequest.meanings[0] },
        ],
      },
      {
        pronunciations: [
          ...createDraftRequest.pronunciations,
          { ...createDraftRequest.pronunciations[0] },
        ],
      },
      {
        meaningPronunciations: [
          {
            meaningRef: 'missing',
            pronunciationRef: 'pronunciation.main',
          },
        ],
      },
    ]) {
      expect(() =>
        vocabularyCandidateApproveRequestSchema.parse({
          ...createDraftRequest,
          ...patch,
        }),
      ).toThrow();
    }
  });

  it('목록 query와 검수 command의 page·revision·request ID를 제한한다', () => {
    expect(
      vocabularyCandidateListQuerySchema.parse({
        reviewStatus: 'PENDING',
        jobId: ids.job,
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      reviewStatus: 'PENDING',
      jobId: ids.job,
      page: 2,
      pageSize: 50,
    });

    for (const input of [
      { page: 0 },
      { page: '01' },
      { pageSize: 101 },
      { page: 1, unknown: true },
    ]) {
      expect(() => vocabularyCandidateListQuerySchema.parse(input)).toThrow();
    }
    expect(() =>
      vocabularyCandidateDiscardRequestSchema.parse({
        expectedRevision: -1,
        requestId: ids.request,
      }),
    ).toThrow();
    expect(() =>
      vocabularyCandidateDiscardRequestSchema.parse({
        expectedRevision: 0,
        requestId: 'request-1',
      }),
    ).toThrow();
  });

  it('DRAFT_CREATED 응답은 실제 vocabularyId만 허용한다', () => {
    const response = {
      candidateId: ids.candidate,
      reviewStatus: 'APPROVED',
      revision: 1,
      resolution: {
        kind: 'DRAFT_CREATED',
        vocabularyId: ids.vocabulary,
      },
    } as const;

    expect(vocabularyCandidateApproveResponseSchema.parse(response)).toEqual(
      response,
    );
    expect(() =>
      vocabularyCandidateApproveResponseSchema.parse({
        ...response,
        resolution: {
          ...response.resolution,
          versionId: ids.item,
        },
      }),
    ).toThrow();
  });

  it('상세 응답에서 provider 원문·private key·storage key·internal run ID를 거절한다', () => {
    const detail = {
      candidate: {
        id: ids.candidate,
        jobId: ids.job,
        jobItemId: ids.item,
        jobAttempt: 1,
        ordinal: 0,
        thai: 'สวัสดี',
        kind: 'WORD',
        meanings: [
          {
            meaningKo: '안녕하세요',
            partOfSpeech: '감탄사',
            difficulty: 1,
          },
        ],
        classification: 'NEW_VOCABULARY',
        resultGroup: 'NORMAL',
        matchedVocabularyId: null,
        suspectedMatches: [],
        review: {
          status: 'PENDING',
          revision: 0,
          resolution: null,
        },
        createdAt: '2026-07-31T00:00:00.000Z',
        updatedAt: '2026-07-31T00:00:00.000Z',
      },
      validations: [
        {
          stage: 'SCHEMA',
          status: 'PASSED',
          code: null,
          evidence: {},
          createdAt: '2026-07-31T00:00:00.000Z',
        },
      ],
    };

    expect(vocabularyCandidateDetailResponseSchema.parse(detail)).toEqual(
      detail,
    );
    for (const privateField of [
      'providerRawPayload',
      'privateInputKey',
      'storageKey',
      'internalRunId',
    ]) {
      expect(() =>
        vocabularyCandidateDetailResponseSchema.parse({
          ...detail,
          candidate: {
            ...detail.candidate,
            [privateField]: 'secret',
          },
        }),
      ).toThrow();
    }
  });
});

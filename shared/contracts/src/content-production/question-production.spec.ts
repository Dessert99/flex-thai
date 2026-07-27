/** AI 문제 후보 관리자 검수 공개 계약의 입력 범위와 비공개 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  approveQuestionCandidateRequestSchema,
  questionCandidateDetailResponseSchema,
  questionCandidateListQuerySchema,
} from './question-production.js';

const candidateId = '405986f9-e552-4ce1-82d6-70a1fc460f96';
const questionId = 'a9979e5d-515d-43ab-a380-e88b78513c38';
const questionVersionId = '77a1e8ff-7c85-4739-9004-647e12e34b65';
const jobItemId = 'dbb22737-6f3d-4112-bb0e-8e4f005c810b';
const typeVersionId = 'cbb22737-6f3d-4112-bb0e-8e4f005c810b';
const topicId = 'eb16b18a-8d19-4c83-9cdb-c36a5d59c4d6';

const payload = {
  questionTypeSlug: 'listening-response',
  questionTypeVersion: 1,
  difficulty: 2,
  topicSlug: 'daily-life',
  tagSlugs: ['greeting'],
  blocks: [
    {
      kind: 'QUESTION',
      displayMode: 'TEXT',
      sentences: [
        {
          speaker: null,
          sentence: {
            originalText: 'สวัสดี',
            translationKo: '안녕하세요',
            pronunciationKo: '싸왓디',
            toneMarks: '',
            tokens: [
              {
                surface: 'สวัสดี',
                startOffset: 0,
                endOffset: 6,
                vocabulary: { clientRef: 'vocabulary-1' },
                meaning: { clientRef: 'meaning-1' },
                pronunciation: { clientRef: 'pronunciation-1' },
                contextMeaningKo: '안녕하세요',
                role: 'TARGET',
              },
            ],
            expressions: [],
          },
        },
      ],
    },
  ],
  options: [
    {
      clientRef: 'option-1',
      position: 0,
      sentence: {
        originalText: '안녕하세요',
        translationKo: '안녕하세요',
        pronunciationKo: '안녕하세요',
        toneMarks: '',
        tokens: [],
        expressions: [],
      },
      span: null,
    },
  ],
  correctOptionRef: 'option-1',
};

const detail = {
  candidate: {
    id: candidateId,
    jobItemId,
    jobAttempt: 1,
    ordinal: 0,
    questionTypeVersionId: typeVersionId,
    topicId,
    tagIds: [],
    difficulty: 2,
    payload,
    resultGroup: 'NORMAL',
    review: {
      status: 'PENDING',
      code: null,
      revision: 3,
      regeneratedFromCandidateId: null,
      approvedQuestionId: null,
      approvedQuestionVersionId: null,
    },
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:01:00.000Z',
  },
  validations: [
    {
      stage: 'SCHEMA',
      status: 'PASSED',
      code: null,
      evidence: { kind: 'NONE' },
      createdAt: '2026-07-27T00:00:00.000Z',
    },
    {
      stage: 'DECISION_RULE',
      status: 'PASSED',
      code: null,
      evidence: { kind: 'NONE' },
      createdAt: '2026-07-27T00:00:00.000Z',
    },
    {
      stage: 'SIMILARITY',
      status: 'PASSED',
      code: null,
      evidence: { kind: 'SIMILARITY_MATCHES', matches: [] },
      createdAt: '2026-07-27T00:00:00.000Z',
    },
    {
      stage: 'AI_CROSS_VALIDATION',
      status: 'PASSED',
      code: null,
      evidence: { kind: 'CROSS_VALIDATION', summary: '독립 검증 통과' },
      createdAt: '2026-07-27T00:00:00.000Z',
    },
  ],
};

describe('AI 문제 후보 관리자 검수 계약', () => {
  it('후보 검수 명령은 UUID와 음수가 아닌 revision만 받는다', () => {
    expect(
      approveQuestionCandidateRequestSchema.parse({
        expectedRevision: 0,
        requestId: 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6',
      }),
    ).toEqual({
      expectedRevision: 0,
      requestId: 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6',
    });
    expect(
      approveQuestionCandidateRequestSchema.safeParse({
        expectedRevision: -1,
        requestId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('후보 목록 query의 페이지 범위와 알 수 없는 key를 거절한다', () => {
    expect(
      questionCandidateListQuerySchema.parse({
        page: '2',
        pageSize: '50',
        jobItemId,
        resultGroup: 'NEEDS_ATTENTION',
      }),
    ).toMatchObject({ page: 2, pageSize: 50, jobItemId });
    expect(
      questionCandidateListQuerySchema.safeParse({ page: 0 }).success,
    ).toBe(false);
    expect(
      questionCandidateListQuerySchema.safeParse({ unexpected: true }).success,
    ).toBe(false);
  });

  it('상세는 네 검증 단계를 canonical 후보·안전한 evidence와 함께 보존한다', () => {
    expect(questionCandidateDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('상세와 모든 중첩 경계에서 provider 원문·prompt·비밀 key를 거절한다', () => {
    expect(
      questionCandidateDetailResponseSchema.safeParse({
        ...detail,
        providerPayload: { secret: true },
      }).success,
    ).toBe(false);
    expect(
      questionCandidateDetailResponseSchema.safeParse({
        ...detail,
        candidate: {
          ...detail.candidate,
          payload: { ...payload, promptBody: 'private prompt' },
        },
      }).success,
    ).toBe(false);
    expect(
      questionCandidateDetailResponseSchema.safeParse({
        ...detail,
        validations: [
          ...detail.validations.slice(0, 3),
          {
            ...detail.validations[3],
            evidence: {
              kind: 'CROSS_VALIDATION',
              summary: '독립 검증 통과',
              privateKey: 'should-not-leak',
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('승인된 후보는 생성된 DRAFT 식별자만 review state에 포함한다', () => {
    expect(
      questionCandidateDetailResponseSchema.parse({
        ...detail,
        candidate: {
          ...detail.candidate,
          review: {
            status: 'APPROVED',
            code: null,
            revision: 4,
            regeneratedFromCandidateId: null,
            approvedQuestionId: questionId,
            approvedQuestionVersionId: questionVersionId,
          },
        },
      }).candidate.review,
    ).toMatchObject({
      status: 'APPROVED',
      approvedQuestionId: questionId,
      approvedQuestionVersionId: questionVersionId,
    });
  });

  it('ISO datetime과 후보 payload의 중첩 unknown key를 거절한다', () => {
    expect(
      questionCandidateDetailResponseSchema.safeParse({
        ...detail,
        candidate: { ...detail.candidate, createdAt: '2026-07-27' },
      }).success,
    ).toBe(false);
    expect(
      questionCandidateDetailResponseSchema.safeParse({
        ...detail,
        candidate: {
          ...detail.candidate,
          payload: {
            ...payload,
            blocks: [{ ...payload.blocks[0], providerRawPayload: {} }],
          },
        },
      }).success,
    ).toBe(false);
  });
});

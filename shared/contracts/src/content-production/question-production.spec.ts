/** AI 문제 후보 관리자 검수 공개 계약의 입력 범위와 비공개 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  approveQuestionCandidateRequestSchema,
  approveQuestionCandidateResponseSchema,
  discardQuestionCandidateRequestSchema,
  discardQuestionCandidateResponseSchema,
  questionCandidateDetailResponseSchema,
  questionCandidateListQuerySchema,
  questionCandidateListResponseSchema,
  questionCandidatePathSchema,
  regenerateQuestionCandidateRequestSchema,
  regenerateQuestionCandidateResponseSchema,
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
      evidence: { kind: 'NONE' },
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

const summary = {
  id: candidateId,
  jobItemId,
  jobAttempt: 1,
  ordinal: 0,
  questionTypeVersionId: typeVersionId,
  topicId,
  difficulty: 2,
  resultGroup: 'NORMAL',
  review: detail.candidate.review,
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:01:00.000Z',
};

const requestId = 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6';

const expectSchemaRejects = (
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) => {
  expect(schema.safeParse(value).success).toBe(false);
};

describe('AI 문제 후보 관리자 검수 계약', () => {
  it('후보 검수 명령은 UUID와 음수가 아닌 revision만 받는다', () => {
    expect(
      approveQuestionCandidateRequestSchema.parse({
        expectedRevision: 0,
        requestId,
      }),
    ).toEqual({
      expectedRevision: 0,
      requestId,
    });
    expect(
      approveQuestionCandidateRequestSchema.safeParse({
        expectedRevision: -1,
        requestId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('후보 경로는 UUID만 받고 명령 body의 각 private actor field를 거절한다', () => {
    expect(questionCandidatePathSchema.parse({ candidateId })).toEqual({
      candidateId,
    });
    expect(
      questionCandidatePathSchema.safeParse({ candidateId: 'candidate-1' })
        .success,
    ).toBe(false);

    for (const schema of [
      approveQuestionCandidateRequestSchema,
      discardQuestionCandidateRequestSchema,
      regenerateQuestionCandidateRequestSchema,
    ]) {
      expect(schema.parse({ expectedRevision: 0, requestId })).toEqual({
        expectedRevision: 0,
        requestId,
      });
      expect(
        schema.safeParse({
          expectedRevision: 0,
          requestId,
          actorUserId: candidateId,
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          expectedRevision: 0,
          requestId,
          actorSub: 'cognito-sub',
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          expectedRevision: 0,
          requestId,
          occurredAt: '2026-07-27T00:00:00.000Z',
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          expectedRevision: 0,
          requestId,
          privateKey: 'private',
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          expectedRevision: 0,
          requestId,
          unexpected: true,
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ expectedRevision: 0, requestId: 'not-a-uuid' })
          .success,
      ).toBe(false);
      expect(
        schema.safeParse({ expectedRevision: -1, requestId }).success,
      ).toBe(false);
    }
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
      questionCandidateListQuerySchema.safeParse({
        page: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      questionCandidateListQuerySchema.safeParse({ pageSize: 101 }).success,
    ).toBe(false);
    expect(
      questionCandidateListQuerySchema.safeParse({ unexpected: true }).success,
    ).toBe(false);
  });

  it('상세는 네 검증 단계를 canonical 후보·안전한 evidence와 함께 보존한다', () => {
    expect(questionCandidateDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('상세는 네 검증 단계를 각각 한 번만 허용한다', () => {
    expect(
      questionCandidateDetailResponseSchema.safeParse({
        ...detail,
        validations: detail.validations.slice(0, 3),
      }).success,
    ).toBe(false);
    expect(
      questionCandidateDetailResponseSchema.safeParse({
        ...detail,
        validations: [
          detail.validations[0],
          detail.validations[1],
          detail.validations[2],
          { ...detail.validations[2] },
        ],
      }).success,
    ).toBe(false);
  });

  it('검증 단계·상태·evidence의 불가능한 조합을 거절한다', () => {
    const invalidDetails = [
      {
        ...detail,
        validations: [
          {
            ...detail.validations[0],
            evidence: { kind: 'CROSS_VALIDATION', summary: '잘못된 근거' },
          },
          ...detail.validations.slice(1),
        ],
      },
      {
        ...detail,
        validations: [
          detail.validations[0],
          { ...detail.validations[1], status: 'FAILED', code: null },
          ...detail.validations.slice(2),
        ],
      },
      {
        ...detail,
        validations: [
          detail.validations[0],
          detail.validations[1],
          {
            ...detail.validations[2],
            evidence: {
              kind: 'SIMILARITY_MATCHES',
              matches: [{ questionVersionId, score: 0.8 }],
            },
          },
          detail.validations[3],
        ],
      },
      {
        ...detail,
        validations: [
          detail.validations[0],
          detail.validations[1],
          {
            ...detail.validations[2],
            status: 'FAILED',
            code: 'QUESTION_SIMILARITY_REVIEW',
            evidence: { kind: 'CROSS_VALIDATION', summary: '잘못된 근거' },
          },
          detail.validations[3],
        ],
      },
      {
        ...detail,
        validations: [
          detail.validations[0],
          detail.validations[1],
          detail.validations[2],
          {
            ...detail.validations[3],
            evidence: {
              kind: 'RETRYABLE_PROVIDER_FAILURE',
              retryable: true,
            },
          },
        ],
      },
    ];

    invalidDetails.forEach((value) => {
      expect(
        questionCandidateDetailResponseSchema.safeParse(value).success,
      ).toBe(false);
    });
  });

  it('실패 검증도 단계에 맞는 stable code와 안전한 evidence면 보존한다', () => {
    expect(
      questionCandidateDetailResponseSchema.parse({
        ...detail,
        validations: [
          {
            ...detail.validations[0],
            status: 'FAILED',
            code: 'QUESTION_SCHEMA_INVALID',
          },
          {
            ...detail.validations[1],
            status: 'FAILED',
            code: 'QUESTION_RULE_INVALID',
          },
          {
            ...detail.validations[2],
            status: 'FAILED',
            code: 'QUESTION_SIMILARITY_REVIEW',
            evidence: {
              kind: 'SIMILARITY_MATCHES',
              matches: [{ questionVersionId, score: 0.8 }],
            },
          },
          {
            ...detail.validations[3],
            status: 'FAILED',
            code: 'QUESTION_PROVIDER_CALL_FAILED',
            evidence: {
              kind: 'RETRYABLE_PROVIDER_FAILURE',
              retryable: true,
            },
          },
        ],
      }).validations,
    ).toHaveLength(4);
  });

  it('선행 검증 실패로 실행하지 않은 단계를 SKIPPED 이력으로 보존한다', () => {
    expect(
      questionCandidateDetailResponseSchema
        .parse({
          ...detail,
          validations: [
            {
              ...detail.validations[0],
              status: 'FAILED',
              code: 'QUESTION_SCHEMA_INVALID',
            },
            ...detail.validations.slice(1).map((validation) => ({
              ...validation,
              status: 'SKIPPED',
              code: 'QUESTION_VALIDATION_SKIPPED',
              evidence: { kind: 'NONE' },
            })),
          ],
        })
        .validations.map(({ status, code }) => ({ status, code })),
    ).toEqual([
      { status: 'FAILED', code: 'QUESTION_SCHEMA_INVALID' },
      { status: 'SKIPPED', code: 'QUESTION_VALIDATION_SKIPPED' },
      { status: 'SKIPPED', code: 'QUESTION_VALIDATION_SKIPPED' },
      { status: 'SKIPPED', code: 'QUESTION_VALIDATION_SKIPPED' },
    ]);
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
          payload: {
            ...payload,
            blocks: [
              {
                ...payload.blocks[0],
                sentences: [
                  {
                    ...payload.blocks[0]!.sentences[0]!,
                    sentence: {
                      ...payload.blocks[0]!.sentences[0]!.sentence,
                      tokens: [
                        {
                          ...payload.blocks[0]!.sentences[0]!.sentence
                            .tokens[0]!,
                          storageKey: 'private/object-key',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
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

  it('목록과 검수 action 응답은 UUID·revision·attempt·count 범위를 검증한다', () => {
    expect(
      questionCandidateListResponseSchema.parse({
        items: [summary],
        page: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }),
    ).toMatchObject({ items: [summary] });
    expect(
      approveQuestionCandidateResponseSchema.parse({
        candidateId,
        review: {
          status: 'APPROVED',
          revision: 1,
          questionId,
          questionVersionId,
        },
      }),
    ).toMatchObject({ candidateId });
    expect(
      discardQuestionCandidateResponseSchema.parse({
        candidateId,
        review: { status: 'DISCARDED', revision: 1 },
      }),
    ).toMatchObject({ candidateId });
    expect(
      regenerateQuestionCandidateResponseSchema.parse({
        candidateId,
        jobId: '8b73c1e2-3f17-4c88-afee-7e3a9fc34bf1',
        attempt: 1,
        revision: 1,
      }),
    ).toMatchObject({ candidateId, attempt: 1 });

    const rejectedResponseCases: Array<
      [{ safeParse: (value: unknown) => { success: boolean } }, unknown]
    > = [
      [
        questionCandidateListResponseSchema,
        {
          items: [],
          page: { page: 0, pageSize: 20, totalItems: 0, totalPages: 0 },
        },
      ],
      [
        questionCandidateListResponseSchema,
        {
          items: [],
          page: { page: 1, pageSize: 101, totalItems: 0, totalPages: 0 },
        },
      ],
      [
        questionCandidateListResponseSchema,
        {
          items: [],
          page: { page: 1, pageSize: 20, totalItems: -1, totalPages: 0 },
        },
      ],
      [
        questionCandidateListResponseSchema,
        {
          items: [],
          page: { page: 1, pageSize: 20, totalItems: 0, totalPages: -1 },
        },
      ],
      [
        approveQuestionCandidateResponseSchema,
        {
          candidateId,
          review: {
            status: 'APPROVED',
            revision: -1,
            questionId: 'not-a-uuid',
            questionVersionId,
          },
        },
      ],
      [
        discardQuestionCandidateResponseSchema,
        { candidateId, review: { status: 'DISCARDED', revision: -1 } },
      ],
      [
        regenerateQuestionCandidateResponseSchema,
        {
          candidateId,
          jobId: 'not-a-uuid',
          attempt: 0,
          revision: -1,
        },
      ],
    ];

    for (const [schema, value] of rejectedResponseCases) {
      expectSchemaRejects(schema, value);
    }
  });

  it('각 action response의 UUID·revision·attempt·count 경계를 한 field씩 검증한다', () => {
    const approved = {
      candidateId,
      review: {
        status: 'APPROVED' as const,
        revision: 1,
        questionId,
        questionVersionId,
      },
    };
    const discarded = {
      candidateId,
      review: { status: 'DISCARDED' as const, revision: 1 },
    };
    const regenerated = {
      candidateId,
      jobId: '8b73c1e2-3f17-4c88-afee-7e3a9fc34bf1',
      attempt: 1,
      revision: 1,
    };
    const list = {
      items: [summary],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    };

    const isolatedInvalidFields: Array<
      [{ safeParse: (value: unknown) => { success: boolean } }, unknown]
    > = [
      [
        questionCandidateListResponseSchema,
        { ...list, items: [{ ...summary, id: 'not-a-uuid' }] },
      ],
      [
        questionCandidateDetailResponseSchema,
        { ...detail, candidate: { ...detail.candidate, id: 'not-a-uuid' } },
      ],
      [
        questionCandidateListResponseSchema,
        { ...list, page: { ...list.page, page: 0 } },
      ],
      [
        questionCandidateListResponseSchema,
        { ...list, page: { ...list.page, pageSize: 101 } },
      ],
      [
        questionCandidateListResponseSchema,
        { ...list, page: { ...list.page, totalItems: -1 } },
      ],
      [
        questionCandidateListResponseSchema,
        { ...list, page: { ...list.page, totalPages: -1 } },
      ],
      [
        approveQuestionCandidateResponseSchema,
        { ...approved, candidateId: 'not-a-uuid' },
      ],
      [
        approveQuestionCandidateResponseSchema,
        {
          ...approved,
          review: { ...approved.review, questionId: 'not-a-uuid' },
        },
      ],
      [
        approveQuestionCandidateResponseSchema,
        {
          ...approved,
          review: { ...approved.review, questionVersionId: 'not-a-uuid' },
        },
      ],
      [
        approveQuestionCandidateResponseSchema,
        { ...approved, review: { ...approved.review, revision: -1 } },
      ],
      [
        discardQuestionCandidateResponseSchema,
        { ...discarded, candidateId: 'not-a-uuid' },
      ],
      [
        discardQuestionCandidateResponseSchema,
        { ...discarded, review: { ...discarded.review, revision: -1 } },
      ],
      [
        regenerateQuestionCandidateResponseSchema,
        { ...regenerated, candidateId: 'not-a-uuid' },
      ],
      [
        regenerateQuestionCandidateResponseSchema,
        { ...regenerated, jobId: 'not-a-uuid' },
      ],
      [
        regenerateQuestionCandidateResponseSchema,
        { ...regenerated, attempt: 0 },
      ],
      [
        regenerateQuestionCandidateResponseSchema,
        { ...regenerated, revision: -1 },
      ],
    ];

    isolatedInvalidFields.forEach(([schema, value]) =>
      expectSchemaRejects(schema, value),
    );
  });

  it('모든 목록·상세·검수 응답의 알 수 없는 key를 거절한다', () => {
    const responseCases: Array<
      [
        { safeParse: (value: unknown) => { success: boolean } },
        Record<string, unknown>,
      ]
    > = [
      [
        questionCandidateListResponseSchema,
        {
          items: [summary],
          page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        },
      ],
      [questionCandidateDetailResponseSchema, detail],
      [
        approveQuestionCandidateResponseSchema,
        {
          candidateId,
          review: {
            status: 'APPROVED',
            revision: 1,
            questionId,
            questionVersionId,
          },
        },
      ],
      [
        discardQuestionCandidateResponseSchema,
        { candidateId, review: { status: 'DISCARDED', revision: 1 } },
      ],
      [
        regenerateQuestionCandidateResponseSchema,
        {
          candidateId,
          jobId: '8b73c1e2-3f17-4c88-afee-7e3a9fc34bf1',
          attempt: 1,
          revision: 1,
        },
      ],
    ];

    responseCases.forEach(([schema, value]) => {
      expectSchemaRejects(schema, { ...value, privateKey: 'private' });
    });
  });
});

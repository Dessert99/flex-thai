/** AI 문제 후보 application service의 공개 projection·감사 문맥 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  QuestionCandidateApplicationError,
  QuestionCandidateApplicationService,
  type QuestionCandidateReadDetail,
  type QuestionCandidateReadRecord,
} from './question-production.service.js';

const candidateId = '405986f9-e552-4ce1-82d6-70a1fc460f96';
const jobItemId = 'dbb22737-6f3d-4112-bb0e-8e4f005c810b';
const typeVersionId = 'cbb22737-6f3d-4112-bb0e-8e4f005c810b';
const topicId = 'eb16b18a-8d19-4c83-9cdb-c36a5d59c4d6';
const questionId = 'a9979e5d-515d-43ab-a380-e88b78513c38';
const questionVersionId = '77a1e8ff-7c85-4739-9004-647e12e34b65';
const bodyRequestId = 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6';
const occurredAt = new Date('2026-07-27T01:02:03.000Z');

const payload = {
  questionTypeSlug: 'listening-response',
  questionTypeVersion: 1,
  difficulty: 2,
  topicSlug: 'daily-life',
  tagSlugs: ['greeting'],
  blocks: [],
  options: [],
  correctOptionRef: 'option-1',
};

const candidate: QuestionCandidateReadRecord = {
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
  reviewStatus: 'PENDING',
  reviewCode: null,
  regeneratedFromCandidateId: null,
  approvedQuestionId: null,
  approvedQuestionVersionId: null,
  revision: 3,
  createdAt: new Date('2026-07-27T00:00:00.000Z'),
  updatedAt: new Date('2026-07-27T00:01:00.000Z'),
};

const detail: QuestionCandidateReadDetail = {
  candidate,
  validations: [
    {
      stage: 'SCHEMA',
      status: 'PASSED',
      code: null,
      details: { providerRaw: 'schema-secret' },
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
    },
    {
      stage: 'DECISION_RULE',
      status: 'PASSED',
      code: null,
      details: { prompt: 'decision-secret' },
      createdAt: new Date('2026-07-27T00:00:01.000Z'),
    },
    {
      stage: 'SIMILARITY',
      status: 'FAILED',
      code: 'QUESTION_SIMILARITY_REVIEW',
      details: {
        matches: [
          {
            questionVersionId,
            score: 0.93,
            summary: '노출하면 안 되는 기존 문제 요약',
          },
        ],
        storageKey: 'private/input.json',
      },
      createdAt: new Date('2026-07-27T00:00:02.000Z'),
    },
    {
      stage: 'AI_CROSS_VALIDATION',
      status: 'FAILED',
      code: 'QUESTION_CROSS_VALIDATION_FAILED',
      details: {
        evidence: {
          summary: '정답 근거가 충분하지 않습니다.',
          providerPayload: { secret: true },
        },
        privateKey: 'private',
      },
      createdAt: new Date('2026-07-27T00:00:03.000Z'),
    },
  ],
};

const actor = {
  userId: '8f47b4d5-97d6-4596-af72-16456be51be8',
  sub: 'cognito-subject',
};

const createService = (options?: {
  found?: QuestionCandidateReadDetail | null;
}) => {
  const query = {
    list: vi.fn().mockResolvedValue({
      items: [
        {
          ...candidate,
          prompt: 'private prompt',
          providerRaw: { secret: true },
        },
      ],
      totalItems: 1,
    }),
    findById: vi
      .fn()
      .mockResolvedValue(options?.found === undefined ? detail : options.found),
  };
  const review = {
    approve: vi.fn().mockResolvedValue({ questionId, questionVersionId }),
    discard: vi.fn().mockResolvedValue(undefined),
    regenerate: vi.fn().mockResolvedValue({
      jobId: '7cd69d0d-6d40-4ac4-a87a-bec70be80478',
      attempt: 2,
    }),
  };
  return {
    query,
    review,
    service: new QuestionCandidateApplicationService(
      query,
      review,
      () => occurredAt,
    ),
  };
};

describe('QuestionCandidateApplicationService 공개 경계', () => {
  it('후보 목록을 strict summary와 안정적인 page로 제한한다', async () => {
    const { query, service } = createService();

    const response = await service.list({
      page: 2,
      pageSize: 20,
      resultGroup: 'NORMAL',
    });

    expect(query.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      resultGroup: 'NORMAL',
    });
    expect(response.page).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    expect(JSON.stringify(response)).not.toContain('payload');
    expect(JSON.stringify(response)).not.toContain('providerRaw');
    expect(JSON.stringify(response)).not.toContain('prompt');
  });

  it('상세 검증 details를 단계별 allow-list evidence로만 투영한다', async () => {
    const { service } = createService();

    const response = await service.get(candidateId);

    expect(response.validations.map(({ evidence }) => evidence)).toEqual([
      { kind: 'NONE' },
      { kind: 'NONE' },
      {
        kind: 'SIMILARITY_MATCHES',
        matches: [{ questionVersionId, score: 0.93 }],
      },
      {
        kind: 'CROSS_VALIDATION',
        summary: '정답 근거가 충분하지 않습니다.',
      },
    ]);
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('providerRaw');
    expect(serialized).not.toContain('providerPayload');
    expect(serialized).not.toContain('privateKey');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('기존 문제 요약');
  });

  it('재시도 가능 provider 실패 외에는 임의 evidence를 공개하지 않는다', async () => {
    const retryableDetail: QuestionCandidateReadDetail = {
      ...detail,
      validations: detail.validations.map((validation) =>
        validation.stage === 'AI_CROSS_VALIDATION'
          ? {
              ...validation,
              details: {
                retryable: true,
                evidence: { reason: 'private-provider-reason' },
              },
            }
          : validation,
      ),
    };
    const { service } = createService({ found: retryableDetail });

    const response = await service.get(candidateId);

    expect(response.validations[3]?.evidence).toEqual({
      kind: 'RETRYABLE_PROVIDER_FAILURE',
      retryable: true,
    });
    expect(JSON.stringify(response)).not.toContain('private-provider-reason');
  });

  it('없는 후보는 안정적인 application 오류로 거절한다', async () => {
    const { service } = createService({ found: null });

    await expect(service.get(candidateId)).rejects.toEqual(
      new QuestionCandidateApplicationError('QUESTION_CANDIDATE_NOT_FOUND'),
    );
    await expect(
      service.approve(actor, candidateId, {
        expectedRevision: 3,
        requestId: bodyRequestId,
      }),
    ).rejects.toEqual(
      new QuestionCandidateApplicationError('QUESTION_CANDIDATE_NOT_FOUND'),
    );
  });

  it('승인·폐기·재생성에 인증 actor·서버 시각과 body replay key를 전달한다', async () => {
    const { review, service } = createService();
    const request = { expectedRevision: 3, requestId: bodyRequestId };

    await expect(service.approve(actor, candidateId, request)).resolves.toEqual(
      {
        candidateId,
        review: {
          status: 'APPROVED',
          revision: 4,
          questionId,
          questionVersionId,
        },
      },
    );
    await expect(
      service.discard(actor, candidateId, request),
    ).resolves.toBeUndefined();
    await expect(
      service.regenerate(actor, candidateId, request),
    ).resolves.toEqual({
      candidateId,
      jobId: '7cd69d0d-6d40-4ac4-a87a-bec70be80478',
      attempt: 2,
      revision: 4,
    });

    const command = {
      candidateId,
      expectedRevision: 3,
      actorUserId: actor.userId,
      actorSub: actor.sub,
      requestId: bodyRequestId,
      occurredAt,
    };
    expect(review.approve).toHaveBeenCalledWith(command);
    expect(review.discard).toHaveBeenCalledWith(command);
    expect(review.regenerate).toHaveBeenCalledWith(command);
  });

  it('동일 requestId 승인 replay를 최초 승인과 같은 공개 응답으로 매핑한다', async () => {
    const { review, service } = createService();
    const request = { expectedRevision: 3, requestId: bodyRequestId };
    review.approve
      .mockResolvedValueOnce({
        questionId,
        questionVersionId,
        replayed: false,
      })
      .mockResolvedValueOnce({
        questionId,
        questionVersionId,
        replayed: true,
      });

    const first = await service.approve(actor, candidateId, request);
    const replay = await service.approve(actor, candidateId, request);

    expect(replay).toEqual(first);
    expect(review.approve).toHaveBeenCalledTimes(2);
    const command = {
      candidateId,
      expectedRevision: 3,
      actorUserId: actor.userId,
      actorSub: actor.sub,
      requestId: bodyRequestId,
      occurredAt,
    };
    expect(review.approve).toHaveBeenNthCalledWith(1, command);
    expect(review.approve).toHaveBeenNthCalledWith(2, command);
  });
});

/** 로컬 콘텐츠 제작 queue가 실제 항목 상태 전이와 재시도를 끝내는지 검증한다 */
import {
  ContentProductionService,
  type QuestionProductionContext,
} from '@flex-thia/domain';
import { describe, expect, it, vi } from 'vitest';
import { DeterministicContentProductionProcessor } from './deterministic-content-production.processor.js';
import { FakeContentProductionRepository } from './fake-content-production.repository.js';
import { LocalContentProductionQueue } from './local-content-production.queue.js';

const questionContext = (): QuestionProductionContext => ({
  commonPrinciples: [],
  difficulty: 1,
  similarityThreshold: 0,
  speakerRoles: [],
  typeVersion: {
    id: '00000000-0000-4000-8000-000000000311',
    slug: 'reading-vocabulary',
    version: 1,
    template: 'STANDARD_CHOICE',
    structureRules: { optionCount: 4 },
    generationRules: {
      allowedTopics: [
        {
          id: '00000000-0000-4000-8000-000000000320',
          slug: 'general',
        },
      ],
      allowedTags: [],
    },
  },
  difficultyCriteria: [],
  approvedExamples: [],
  targetVocabulary: [
    {
      thai: 'สวัสดี',
      meaningKo: '안녕하세요',
      partOfSpeech: '감탄사',
      difficulty: 1,
    },
  ],
  requiredVocabulary: [],
  excludedVocabulary: [],
  newAuxiliaryVocabularyLimit: 0,
  similarQuestions: [],
  additionalInstructionKo: null,
});

const createProcessor = (options?: { persistedCandidates?: unknown[] }) =>
  new DeterministicContentProductionProcessor({
    vocabularyLookup: {
      findExact: () => Promise.resolve(null),
      findSuspected: () => Promise.resolve([]),
    },
    questionContext: {
      load: () => Promise.resolve(questionContext()),
    },
    questionCandidates: {
      persist: (input) => {
        options?.persistedCandidates?.push(input);
        return Promise.resolve(true);
      },
    },
  });

const createCommand = (options?: {
  purpose?:
    | 'VOCABULARY_EXTRACTION'
    | 'QUESTION_GENERATION'
    | 'VOCABULARY_THEN_QUESTION_GENERATION';
  inputs?: number[];
  parameters?: Record<string, unknown>;
  clientRequestId?: string;
}) => ({
  requestedBy: '4e6c319e-29c9-4940-ab59-57e9f3a69120',
  clientRequestId: options?.clientRequestId ?? 'local-request',
  purpose: options?.purpose ?? ('VOCABULARY_EXTRACTION' as const),
  presetSnapshot: {
    id: '1a2b30f6-9e2a-4cf1-996d-a9f9adcc18fb',
    name: '로컬 어휘 추출',
    purpose: options?.purpose ?? ('VOCABULARY_EXTRACTION' as const),
    version: 1,
    parameters: {
      suspectedDuplicateMaxCodePointDistance: 0,
      ...options?.parameters,
    },
  },
  inputs: (options?.inputs ?? [0, 1, 2]).map((index) => ({
    uploadId: `00000000-0000-4000-8000-00000000000${index}`,
    inputType: 'TEXT' as const,
    inputKey: `inputs/local/${index}`,
    sizeBytes: 10,
  })),
});

describe('LocalContentProductionQueue', () => {
  it('로컬 작업을 다음 event loop에서 부분 실패 terminal 상태까지 처리한다', async () => {
    const repository = new FakeContentProductionRepository();
    const queue = new LocalContentProductionQueue(
      repository,
      createProcessor(),
    );
    const service = new ContentProductionService(repository, queue);

    const queued = await service.create(createCommand());
    expect(queued.status).toBe('QUEUED');

    await queue.waitForIdle();

    await expect(
      repository.findOwnedById(queued.requestedBy, queued.id),
    ).resolves.toMatchObject({
      status: 'COMPLETED_WITH_FAILURES',
      counts: {
        total: 3,
        succeeded: 1,
        needsAttention: 1,
        failed: 1,
      },
    });
  });

  it('retryable 실패 항목을 다음 attempt에서 다시 처리한다', async () => {
    const repository = new FakeContentProductionRepository();
    const queue = new LocalContentProductionQueue(
      repository,
      createProcessor(),
    );
    const service = new ContentProductionService(repository, queue);
    const created = await service.create(createCommand());
    await queue.waitForIdle();

    const retried = await service.retry(created.requestedBy, created.id);
    expect(retried).toMatchObject({ status: 'QUEUED', attempt: 1 });

    await queue.waitForIdle();

    await expect(
      repository.findOwnedById(created.requestedBy, created.id),
    ).resolves.toMatchObject({
      status: 'COMPLETED_WITH_FAILURES',
      attempt: 1,
      counts: { succeeded: 1, needsAttention: 1, failed: 1 },
    });
  });

  it('선언된 문제 계획을 count와 순서 그대로 펼쳐 questionPlan을 보존한다', async () => {
    const repository = new FakeContentProductionRepository();
    const queue = new LocalContentProductionQueue(
      repository,
      createProcessor(),
    );
    const service = new ContentProductionService(repository, queue);
    const created = await service.create(
      createCommand({
        purpose: 'QUESTION_GENERATION',
        inputs: [0, 1],
        parameters: {
          questionCount: 3,
          questionTypePlan: [
            {
              questionTypeVersionId: '00000000-0000-4000-8000-000000000311',
              count: 2,
            },
            {
              questionTypeVersionId: '00000000-0000-4000-8000-000000000315',
              count: 1,
            },
          ],
          difficultyPlan: [
            { difficulty: 1, count: 1 },
            { difficulty: 2, count: 2 },
          ],
          newAuxiliaryVocabularyLimit: 0,
        },
      }),
    );

    await queue.waitForIdle();

    const job = await repository.findOwnedById(created.requestedBy, created.id);
    expect(
      job?.items.map((item) => {
        const planned = item as typeof item & {
          questionPlan: unknown;
        };
        return {
          sourceRef: planned.sourceRef,
          questionPlan: planned.questionPlan,
        };
      }),
    ).toEqual([
      {
        sourceRef: 'input:0:question:0',
        questionPlan: {
          questionPlanIndex: 0,
          questionTypeVersionId: '00000000-0000-4000-8000-000000000311',
          difficulty: 1,
        },
      },
      {
        sourceRef: 'input:1:question:1',
        questionPlan: {
          questionPlanIndex: 1,
          questionTypeVersionId: '00000000-0000-4000-8000-000000000311',
          difficulty: 2,
        },
      },
      {
        sourceRef: 'input:0:question:2',
        questionPlan: {
          questionPlanIndex: 2,
          questionTypeVersionId: '00000000-0000-4000-8000-000000000315',
          difficulty: 2,
        },
      },
    ]);
  });

  it('어휘 artifact와 같은 question item 재전달의 후보를 각각 한 번만 저장한다', async () => {
    const repository = new FakeContentProductionRepository();
    const persistedCandidates: unknown[] = [];
    const queue = new LocalContentProductionQueue(
      repository,
      createProcessor({ persistedCandidates }),
    );
    const finishItem = vi.spyOn(repository, 'finishItem');
    const service = new ContentProductionService(repository, queue);
    const vocabulary = await service.create(createCommand());
    await queue.waitForIdle();

    expect(
      finishItem.mock.calls.some((call) => {
        const outcome = call[4] as {
          artifacts?: { kind: string; candidates: unknown[] };
        };
        return (
          outcome.artifacts?.kind === 'VOCABULARY_CANDIDATES' &&
          outcome.artifacts.candidates.length === 1
        );
      }),
    ).toBe(true);

    const question = await service.create(
      createCommand({
        purpose: 'QUESTION_GENERATION',
        inputs: [0],
        clientRequestId: 'local-question-request',
        parameters: {
          questionCount: 1,
          questionTypePlan: [
            {
              questionTypeVersionId: '00000000-0000-4000-8000-000000000311',
              count: 1,
            },
          ],
          difficultyPlan: [{ difficulty: 1, count: 1 }],
          newAuxiliaryVocabularyLimit: 0,
        },
      }),
    );
    await queue.waitForIdle();
    await queue.send({ jobId: question.id, attempt: question.attempt });
    await queue.waitForIdle();

    expect(vocabulary.status).toBe('QUEUED');
    expect(persistedCandidates).toHaveLength(1);
  });
});

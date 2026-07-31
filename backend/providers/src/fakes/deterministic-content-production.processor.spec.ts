/** 외부 비용 없는 processor가 sourceRef로 성공·검토·실패를 결정적으로 재현하는지 검증한다 */
import type {
  ContentProductionWorkItem,
  QuestionProductionContext,
} from '@flex-thia/domain';
import { describe, expect, it } from 'vitest';
import { DeterministicContentProductionProcessor } from './deterministic-content-production.processor.js';

const questionContext = (): QuestionProductionContext => ({
  commonPrinciples: [],
  difficulty: 1,
  similarityThreshold: 0,
  speakerRoles: [],
  typeVersion: {
    id: 'type-version-id',
    slug: 'reading-choice',
    version: 1,
    template: 'STANDARD_CHOICE',
    structureRules: { optionCount: 4 },
    generationRules: {
      allowedTopics: [{ id: 'topic-id', slug: 'daily-life' }],
      allowedTags: [],
    },
  },
  difficultyCriteria: [],
  approvedExamples: [],
  targetVocabulary: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      thai: 'สวัสดี',
      meaningId: '00000000-0000-4000-8000-000000000102',
      meaningKo: '안녕하세요',
      partOfSpeech: '감탄사',
      difficulty: 1,
      pronunciationId: '00000000-0000-4000-8000-000000000103',
    },
  ],
  requiredVocabulary: [],
  excludedVocabulary: [],
  newAuxiliaryVocabularyLimit: 0,
  similarQuestions: [],
  additionalInstructionKo: null,
});

const createProcessor = (persistedCandidates: unknown[] = []) =>
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
        persistedCandidates.push(input);
        return Promise.resolve(true);
      },
    },
  });

const workItem = (
  sourceRef: string,
  operation:
    'VOCABULARY_EXTRACTION' | 'QUESTION_GENERATION' = 'VOCABULARY_EXTRACTION',
): ContentProductionWorkItem => ({
  jobId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
  jobAttempt: 0,
  requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
  purpose:
    operation === 'QUESTION_GENERATION'
      ? 'QUESTION_GENERATION'
      : 'VOCABULARY_EXTRACTION',
  presetSnapshot: {
    id: 'a9979e5d-515d-43ab-a380-e88b78513c38',
    name: '로컬 어휘 추출',
    purpose:
      operation === 'QUESTION_GENERATION'
        ? 'QUESTION_GENERATION'
        : 'VOCABULARY_EXTRACTION',
    version: 1,
    parameters:
      operation === 'QUESTION_GENERATION'
        ? {
            questionCount: 1,
            questionTypePlan: [
              { questionTypeVersionId: 'type-version-id', count: 1 },
            ],
            difficultyPlan: [{ difficulty: 1, count: 1 }],
            newAuxiliaryVocabularyLimit: 0,
          }
        : { suspectedDuplicateMaxCodePointDistance: 0 },
  },
  item: {
    id: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
    sourceRef,
    jobInputId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
    operation,
    questionPlan:
      operation === 'QUESTION_GENERATION'
        ? {
            questionPlanIndex: 0,
            questionTypeVersionId: 'type-version-id',
            difficulty: 1,
          }
        : null,
    status: 'PROCESSING',
    attempt: 0,
    retryable: false,
    errorCode: null,
    leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
    leaseToken: 'lease-token',
  },
  input: {
    jobInputId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
    ordinal: 0,
    uploadId: '5d024629-f887-4fae-ad46-20dc24d6de7d',
    inputType: 'TEXT',
    inputKey: 'inputs/local/0',
    sizeBytes: 10,
  },
});

describe('DeterministicContentProductionProcessor local 처리', () => {
  it('sourceRef 입력 순서로 부분 실패와 검토 필요 결과를 재현한다', async () => {
    const processor = createProcessor();
    const signal = new AbortController().signal;

    await expect(
      processor.process(workItem('input:0'), signal),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      retryable: false,
    });
    await expect(
      processor.process(workItem('input:1:question'), signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: false,
    });
    await expect(
      processor.process(workItem('input:2:vocabulary'), signal),
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: true,
      errorCode: 'LOCAL_FAKE_FAILURE',
    });
  });

  it('취소된 lease의 항목 처리를 시작하지 않는다', async () => {
    const processor = createProcessor();
    const controller = new AbortController();
    controller.abort(new Error('lease lost'));

    await expect(
      processor.process(workItem('input:0'), controller.signal),
    ).rejects.toThrow('lease lost');
  });

  it('ordinal 0 문제 item의 canonical draft 후보와 검증 artifact를 기존 repository port에 저장한다', async () => {
    const persistedCandidates: unknown[] = [];
    const processor = createProcessor(persistedCandidates);

    await expect(
      processor.process(
        workItem('input:0:question:0', 'QUESTION_GENERATION'),
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
      result: { total: 1, normal: 1, needsAttention: 0, failed: 0 },
    });
    expect(persistedCandidates).toMatchObject([
      {
        jobId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        itemId: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
        attempt: 0,
        artifacts: {
          kind: 'QUESTION_CANDIDATES',
          candidates: [
            {
              resultGroup: 'NORMAL',
              reviewStatus: 'PENDING',
              candidate: {
                payloadState: 'CANONICAL',
                questionTypeVersionId: 'type-version-id',
                topicId: 'topic-id',
              },
            },
          ],
          validations: [
            { stage: 'SCHEMA', status: 'PASSED' },
            {
              stage: 'DECISION_RULE',
              status: 'PASSED',
            },
            {
              stage: 'SIMILARITY',
              status: 'PASSED',
            },
            {
              stage: 'AI_CROSS_VALIDATION',
              status: 'PASSED',
            },
          ],
        },
      },
    ]);
    expect(
      (
        persistedCandidates[0] as {
          artifacts: {
            candidates: Array<{
              candidate: {
                payload: {
                  blocks: Array<{
                    sentences: Array<{
                      sentence: {
                        tokens: Array<{
                          vocabulary: unknown;
                          meaning: unknown;
                          pronunciation: unknown;
                        }>;
                      };
                    }>;
                  }>;
                };
              };
            }>;
          };
        }
      ).artifacts.candidates[0]!.candidate.payload.blocks[0]!.sentences[0]!
        .sentence.tokens[0],
    ).toMatchObject({
      vocabulary: { id: '00000000-0000-4000-8000-000000000101' },
      meaning: { id: '00000000-0000-4000-8000-000000000102' },
      pronunciation: { id: '00000000-0000-4000-8000-000000000103' },
    });
  });
});

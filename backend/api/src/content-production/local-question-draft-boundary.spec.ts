/** local deterministic 후보가 실제 Drizzle DRAFT writer 승인을 통과하는지 검증한다 */
import { DrizzleGeneratedQuestionDraftRepository } from '@flex-thia/database';
import type {
  ContentProductionWorkItem,
  QuestionProductionContext,
} from '@flex-thia/domain';
import { DeterministicContentProductionProcessor } from '@flex-thia/providers';
import { describe, expect, it, vi } from 'vitest';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  candidate: '00000000-0000-4000-8000-000000000002',
  typeVersion: '00000000-0000-4000-8000-000000000311',
  topic: '00000000-0000-4000-8000-000000000320',
  vocabulary: '00000000-0000-4000-8000-000000000101',
  meaning: '00000000-0000-4000-8000-000000000201',
  pronunciation: '00000000-0000-4000-8000-000000000211',
} as const;

const context: QuestionProductionContext = {
  commonPrinciples: [],
  difficulty: 1,
  similarityThreshold: 0,
  speakerRoles: [],
  typeVersion: {
    id: ids.typeVersion,
    slug: 'reading-vocabulary',
    version: 1,
    template: 'STANDARD_CHOICE',
    structureRules: { optionCount: 4 },
    generationRules: {
      allowedTopics: [{ id: ids.topic, slug: 'general' }],
      allowedTags: [],
    },
  },
  difficultyCriteria: [],
  approvedExamples: [],
  targetVocabulary: [
    {
      id: ids.vocabulary,
      thai: 'สวัสดี',
      meaningId: ids.meaning,
      meaningKo: '안녕하세요',
      partOfSpeech: '감탄사',
      difficulty: 1,
      pronunciationId: ids.pronunciation,
      pronunciationKo: '싸왓디',
    },
  ],
  requiredVocabulary: [],
  excludedVocabulary: [],
  newAuxiliaryVocabularyLimit: 0,
  similarQuestions: [],
  additionalInstructionKo: null,
};

const workItem: ContentProductionWorkItem = {
  jobId: '00000000-0000-4000-8000-000000000401',
  jobAttempt: 0,
  requestedBy: ids.actor,
  purpose: 'QUESTION_GENERATION',
  presetSnapshot: {
    id: '00000000-0000-4000-8000-000000000902',
    name: '기본 문제 생성',
    purpose: 'QUESTION_GENERATION',
    version: 1,
    parameters: {
      questionCount: 1,
      questionTypePlan: [{ questionTypeVersionId: ids.typeVersion, count: 1 }],
      difficultyPlan: [{ difficulty: 1, count: 1 }],
      newAuxiliaryVocabularyLimit: 0,
    },
  },
  item: {
    id: '00000000-0000-4000-8000-000000000402',
    sourceRef: 'input:0:question:0',
    jobInputId: '00000000-0000-4000-8000-000000000403',
    operation: 'QUESTION_GENERATION',
    questionPlan: {
      questionPlanIndex: 0,
      questionTypeVersionId: ids.typeVersion,
      difficulty: 1,
    },
    status: 'PROCESSING',
    attempt: 0,
    retryable: false,
    errorCode: null,
    leaseUntil: new Date('2026-07-31T00:05:00.000Z'),
    leaseToken: 'lease-token',
  },
  input: {
    jobInputId: '00000000-0000-4000-8000-000000000403',
    ordinal: 0,
    uploadId: '00000000-0000-4000-8000-000000000930',
    inputType: 'TEXT',
    inputKey: 'local/content-production/source.txt',
    sizeBytes: 128,
  },
};

const draftTransaction = () => {
  const selectedRows = [
    [
      {
        id: ids.typeVersion,
        slug: 'reading-vocabulary',
        version: 1,
        template: 'STANDARD_CHOICE',
        optionCount: 4,
      },
    ],
    [{ id: ids.topic, slug: 'general' }],
    [{ id: ids.vocabulary, kind: 'WORD', status: 'PUBLISHED' }],
    [{ id: ids.meaning, vocabularyId: ids.vocabulary }],
    [{ id: ids.pronunciation, vocabularyId: ids.vocabulary }],
  ];
  const select = vi.fn(() => {
    const rows = selectedRows.shift() ?? [];
    const chain: Record<string, unknown> & PromiseLike<unknown[]> = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      for: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  });
  const insert = vi.fn(() => ({
    values: vi.fn(() => Promise.resolve()),
  }));
  return { insert, select };
};

describe('local 문제 후보 DRAFT 경계', () => {
  it('deterministic NORMAL 후보를 실제 Drizzle writer가 DRAFT로 승인한다', async () => {
    const persisted: unknown[] = [];
    const processor = new DeterministicContentProductionProcessor({
      vocabularyLookup: {
        findExact: () => Promise.resolve(null),
        findSuspected: () => Promise.resolve([]),
      },
      questionContext: { load: () => Promise.resolve(context) },
      questionCandidates: {
        persist: (input) => {
          persisted.push(input);
          return Promise.resolve(true);
        },
      },
    });
    await processor.process(workItem, new AbortController().signal);
    const artifact = persisted[0] as {
      artifacts: {
        candidates: Array<{
          candidate: {
            questionTypeVersionId: string;
            topicId: string;
            difficulty: number;
            payload: unknown;
          };
        }>;
      };
    };
    const candidate = artifact.artifacts.candidates[0]!.candidate;
    let generated = 0;
    const writer = new DrizzleGeneratedQuestionDraftRepository(
      () => `10000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`,
    );

    await expect(
      writer.createDraft(
        draftTransaction() as never,
        {
          candidate: {
            id: ids.candidate,
            typeVersionId: candidate.questionTypeVersionId,
            topicId: candidate.topicId,
            difficulty: candidate.difficulty,
            payload: candidate.payload,
          },
          actor: {
            actorUserId: ids.actor,
            actorSub: 'local-admin',
            requestId: 'local-request',
            occurredAt: new Date('2026-07-31T00:00:00.000Z'),
          },
        } as never,
      ),
    ).resolves.toEqual({
      questionId: '10000000-0000-4000-8000-000000000001',
      questionVersionId: '10000000-0000-4000-8000-000000000002',
    });
  });
});

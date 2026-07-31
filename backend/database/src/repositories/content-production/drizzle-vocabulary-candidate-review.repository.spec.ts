import { describe, expect, it, vi } from 'vitest';
import {
  auditLogs,
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyProductionCandidates,
  vocabularyPronunciations,
} from '../../schema/index.js';
import { DrizzleVocabularyCandidateReviewRepository } from './drizzle-vocabulary-candidate-review.repository.js';

const commandContext = {
  candidateId: '00000000-0000-4000-8000-000000000001',
  expectedRevision: 0,
  actorUserId: '00000000-0000-4000-8000-000000000002',
  actorSub: 'actor-sub',
  requestId: '00000000-0000-4000-8000-000000000003',
  occurredAt: new Date('2026-07-31T00:00:00.000Z'),
};

const createDraftCommand = {
  ...commandContext,
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
        mediaAssetId: '00000000-0000-4000-8000-000000000004',
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

const pendingCandidate = {
  id: commandContext.candidateId,
  thai: createDraftCommand.draft.thai,
  normalizedThai: createDraftCommand.draft.thai,
  kind: createDraftCommand.draft.kind,
  meanings: createDraftCommand.draft.meanings.map(
    ({ meaningKo, partOfSpeech, difficulty }) => ({
      meaningKo,
      partOfSpeech,
      difficulty,
    }),
  ),
  classification: 'NEW_VOCABULARY',
  resultGroup: 'NORMAL',
  reviewStatus: 'PENDING',
  revision: 0,
  resolutionKind: null,
  resolvedVocabularyId: null,
};

const selectChain = (rows: unknown[]) => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    for: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
};

const createDatabase = (selectResults: unknown[][]) => {
  const queue = [...selectResults];
  const insertedTables: unknown[] = [];
  const insertedValues: unknown[] = [];
  const updatedValues: unknown[] = [];
  const execute = vi.fn().mockResolvedValue([]);
  const select = vi.fn(() => selectChain(queue.shift() ?? []));
  const insert = vi.fn((table: unknown) => {
    insertedTables.push(table);
    const onConflictDoNothing = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: 'inserted-id' }]),
    }));
    const values = vi.fn((value: unknown) => {
      insertedValues.push(value);
      return {
        onConflictDoNothing,
        returning: vi.fn().mockResolvedValue([{ id: 'inserted-id' }]),
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (error: unknown) => unknown,
        ) => Promise.resolve(undefined).then(resolve, reject),
      };
    });
    return { values };
  });
  const update = vi.fn(() => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: commandContext.candidateId }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn((value: unknown) => {
      updatedValues.push(value);
      return { where };
    });
    return { set };
  });
  const transaction = vi.fn(
    (callback: (executor: unknown) => Promise<unknown>) =>
      callback({ execute, insert, select, update }),
  );
  return {
    database: { transaction },
    insertedTables,
    insertedValues,
    updatedValues,
  };
};

describe('DrizzleVocabularyCandidateReviewRepository', () => {
  it('CREATE_DRAFT는 후보·DRAFT graph·audit·replay 결과를 한 transaction에서 저장한다', async () => {
    const fake = createDatabase([
      [pendingCandidate],
      [],
      [
        { stage: 'SCHEMA', status: 'PASSED' },
        { stage: 'DECISION_RULE', status: 'PASSED' },
        { stage: 'AI_CROSS_VALIDATION', status: 'PASSED' },
      ],
      [{ id: createDraftCommand.draft.pronunciations[0]!.mediaAssetId }],
    ]);
    const generatedIds = [
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000013',
    ];
    const repository = new DrizzleVocabularyCandidateReviewRepository(
      fake.database as never,
      () => commandContext.occurredAt,
      () => generatedIds.shift()!,
    );

    await expect(repository.approve(createDraftCommand)).resolves.toEqual({
      kind: 'APPLIED',
      result: {
        candidateId: commandContext.candidateId,
        reviewStatus: 'APPROVED',
        revision: 1,
        resolution: {
          kind: 'DRAFT_CREATED',
          vocabularyId: '00000000-0000-4000-8000-000000000010',
          versionId: '00000000-0000-4000-8000-000000000011',
        },
      },
    });
    expect(fake.insertedTables).toEqual([
      vocabularies,
      vocabularyMeanings,
      vocabularyPronunciations,
      vocabularyMeaningPronunciations,
      auditLogs,
    ]);
    expect(fake.updatedValues).toContainEqual(
      expect.objectContaining({
        reviewStatus: 'APPROVED',
        revision: 1,
        resolutionKind: 'DRAFT_CREATED',
        resolvedVocabularyId: '00000000-0000-4000-8000-000000000010',
      }),
    );
    expect(fake.insertedValues.at(-1)).toEqual(
      expect.objectContaining({
        action: 'VOCABULARY_CANDIDATE_APPROVED',
        requestId: commandContext.requestId,
        summary: expect.objectContaining({
          versionId: '00000000-0000-4000-8000-000000000011',
        }),
      }),
    );
  });

  it('LINK_EXISTING은 기존 어휘를 확인하고 candidate resolution만 변경한다', async () => {
    const vocabularyId = '00000000-0000-4000-8000-000000000020';
    const fake = createDatabase([
      [pendingCandidate],
      [],
      [{ id: vocabularyId }],
    ]);
    const repository = new DrizzleVocabularyCandidateReviewRepository(
      fake.database as never,
      () => commandContext.occurredAt,
    );

    await expect(
      repository.approve({
        ...commandContext,
        action: 'LINK_EXISTING',
        vocabularyId,
      }),
    ).resolves.toMatchObject({
      kind: 'APPLIED',
      result: {
        resolution: { kind: 'EXISTING_LINKED', vocabularyId },
      },
    });
    expect(fake.insertedTables).toEqual([auditLogs]);
    expect(fake.updatedValues).toContainEqual(
      expect.objectContaining({
        resolutionKind: 'EXISTING_LINKED',
        resolvedVocabularyId: vocabularyId,
      }),
    );
  });

  it('폐기는 어휘 row를 만들지 않고 candidate와 audit만 terminal로 저장한다', async () => {
    const fake = createDatabase([[pendingCandidate], []]);
    const repository = new DrizzleVocabularyCandidateReviewRepository(
      fake.database as never,
      () => commandContext.occurredAt,
    );

    await expect(repository.discard(commandContext)).resolves.toEqual({
      kind: 'APPLIED',
      result: {
        candidateId: commandContext.candidateId,
        reviewStatus: 'DISCARDED',
        revision: 1,
      },
    });
    expect(fake.insertedTables).toEqual([auditLogs]);
    expect(fake.updatedValues).toContainEqual(
      expect.objectContaining({
        reviewStatus: 'DISCARDED',
        revision: 1,
      }),
    );
  });
});

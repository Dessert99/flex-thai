/** 관계 CRUD와 preview·병합 실행의 저장소 호출 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  VocabularyRelationsMergeRepository,
  VocabularyRelationsMergeStoredRelation,
} from './vocabulary-relations-merge.repository.js';
import {
  VocabularyRelationsMergeAdminError,
  VocabularyRelationsMergeService,
  type VocabularyMergeGraph,
} from './vocabulary-relations-merge.service.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  sourceVocabulary: '00000000-0000-4000-8000-000000000002',
  representativeVocabulary: '00000000-0000-4000-8000-000000000003',
  sourceMeaning: '00000000-0000-4000-8000-000000000004',
  targetMeaning: '00000000-0000-4000-8000-000000000005',
  relation: '00000000-0000-4000-8000-000000000006',
} as const;

const context = {
  actorSub: 'admin-sub',
  actorUserId: ids.actor,
  requestId: 'request-id',
  occurredAt: new Date('2026-07-27T00:00:00.000Z'),
};

const graph = (
  id: string,
  status: VocabularyMergeGraph['vocabulary']['status'],
): VocabularyMergeGraph => ({
  vocabulary: {
    id,
    thai: id === ids.sourceVocabulary ? 'สวัสดี' : 'สวัสดิ์',
    normalizedThai: id === ids.sourceVocabulary ? 'สวัสดี' : 'สวัสดิ์',
    kind: 'WORD',
    status,
    mergedIntoVocabularyId: null,
    updatedAt: '2026-07-27T00:00:00.000Z',
  },
  meanings: [
    id === ids.sourceVocabulary ? ids.sourceMeaning : ids.targetMeaning,
  ],
  pronunciations: [],
  meaningPronunciations: [],
  relations: [],
  incomingMergeSourceIds: [],
  tokenOccurrenceIds: [],
  expressionOccurrenceIds: [],
  savedMemberships: [],
  wordbookMemberships: [],
  practiceQuestionIds: [],
});

const storedRelation: VocabularyRelationsMergeStoredRelation = {
  id: ids.relation,
  sourceMeaningId: ids.sourceMeaning,
  targetMeaningId: ids.targetMeaning,
  type: 'SYNONYM',
  direction: 'DIRECTED',
  status: 'PENDING',
  createdAt: context.occurredAt,
  updatedAt: context.occurredAt,
};

const createFake = () => {
  const createRelation = vi.fn().mockResolvedValue(storedRelation);
  const updateRelation = vi.fn().mockResolvedValue({
    ...storedRelation,
    status: 'PASSED',
  });
  const executeMerge = vi.fn().mockResolvedValue({
    sourceVocabularyId: ids.sourceVocabulary,
    representativeVocabularyId: ids.representativeVocabulary,
    movedCounts: {
      meanings: 1,
      pronunciations: 0,
      meaningPronunciations: 0,
      tokenOccurrences: 0,
      expressionOccurrences: 0,
      savedMemberships: 0,
      wordbookMemberships: 0,
      practiceQuestions: 0,
    },
  });
  const repository: VocabularyRelationsMergeRepository = {
    findMeaningOwners: vi.fn().mockResolvedValue([
      { meaningId: ids.sourceMeaning, vocabularyId: ids.sourceVocabulary },
      {
        meaningId: ids.targetMeaning,
        vocabularyId: ids.representativeVocabulary,
      },
    ]),
    createRelation,
    findRelation: vi.fn().mockResolvedValue(storedRelation),
    updateRelation,
    deleteRelation: vi.fn().mockResolvedValue(true),
    loadMergePair: vi.fn().mockResolvedValue({
      source: graph(ids.sourceVocabulary, 'DRAFT'),
      representative: graph(ids.representativeVocabulary, 'PUBLISHED'),
    }),
    executeMerge,
  };
  return { createRelation, executeMerge, repository, updateRelation };
};

describe('VocabularyRelationsMergeService 관계 관리', () => {
  it('경로 어휘가 source 뜻을 소유할 때 canonical PENDING 관계를 생성한다', async () => {
    const fake = createFake();
    const service = new VocabularyRelationsMergeService(
      fake.repository,
      () => ids.relation,
    );

    await expect(
      service.createRelation({
        vocabularyId: ids.sourceVocabulary,
        input: {
          sourceMeaningId: ids.sourceMeaning,
          targetMeaningId: ids.targetMeaning,
          type: 'RELATED',
          direction: 'BIDIRECTIONAL',
        },
        ...context,
      }),
    ).resolves.toEqual(storedRelation);
    expect(fake.createRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ids.relation,
        sourceMeaningId: ids.sourceMeaning,
        targetMeaningId: ids.targetMeaning,
        status: 'PENDING',
      }),
    );
  });

  it('경로 어휘가 canonical source 뜻을 소유하지 않으면 생성하지 않는다', async () => {
    const fake = createFake();
    fake.repository.findMeaningOwners = vi.fn().mockResolvedValue([
      {
        meaningId: ids.sourceMeaning,
        vocabularyId: ids.representativeVocabulary,
      },
      {
        meaningId: ids.targetMeaning,
        vocabularyId: ids.representativeVocabulary,
      },
    ]);

    await expect(
      new VocabularyRelationsMergeService(fake.repository).createRelation({
        vocabularyId: ids.sourceVocabulary,
        input: {
          sourceMeaningId: ids.sourceMeaning,
          targetMeaningId: ids.targetMeaning,
          type: 'SYNONYM',
          direction: 'DIRECTED',
        },
        ...context,
      }),
    ).rejects.toEqual(
      new VocabularyRelationsMergeAdminError('MEANING_RELATION_NOT_FOUND'),
    );
    expect(fake.createRelation).not.toHaveBeenCalled();
  });

  it('BIDIRECTIONAL은 canonical 정렬 전 입력 source 소유권을 검증한다', async () => {
    const fake = createFake();
    fake.repository.findMeaningOwners = vi.fn().mockResolvedValue([
      {
        meaningId: ids.sourceMeaning,
        vocabularyId: ids.representativeVocabulary,
      },
      {
        meaningId: ids.targetMeaning,
        vocabularyId: ids.sourceVocabulary,
      },
    ]);
    const service = new VocabularyRelationsMergeService(
      fake.repository,
      () => ids.relation,
    );

    await service.createRelation({
      vocabularyId: ids.sourceVocabulary,
      input: {
        sourceMeaningId: ids.targetMeaning,
        targetMeaningId: ids.sourceMeaning,
        type: 'RELATED',
        direction: 'BIDIRECTIONAL',
      },
      ...context,
    });

    expect(fake.createRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMeaningId: ids.sourceMeaning,
        targetMeaningId: ids.targetMeaning,
      }),
    );
  });

  it('메타데이터 수정은 검토 상태를 PENDING으로 되돌리고 terminal 직행은 거절한다', async () => {
    const fake = createFake();
    fake.repository.findRelation = vi.fn().mockResolvedValue({
      ...storedRelation,
      status: 'PASSED',
    });
    const service = new VocabularyRelationsMergeService(fake.repository);

    await service.updateRelation({
      vocabularyId: ids.sourceVocabulary,
      relationId: ids.relation,
      input: { type: 'ANTONYM' },
      ...context,
    });
    expect(fake.updateRelation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ANTONYM', status: 'PENDING' }),
    );

    await expect(
      service.updateRelation({
        vocabularyId: ids.sourceVocabulary,
        relationId: ids.relation,
        input: { status: 'FAILED' },
        ...context,
      }),
    ).rejects.toMatchObject({ code: 'MEANING_RELATION_STATE_CONFLICT' });
  });

  it('BIDIRECTIONAL 전환 시 뜻 UUID를 canonical 순서로 다시 정렬한다', async () => {
    const fake = createFake();
    fake.repository.findRelation = vi.fn().mockResolvedValue({
      ...storedRelation,
      sourceMeaningId: ids.targetMeaning,
      targetMeaningId: ids.sourceMeaning,
    });
    const service = new VocabularyRelationsMergeService(fake.repository);

    await service.updateRelation({
      vocabularyId: ids.sourceVocabulary,
      relationId: ids.relation,
      input: { direction: 'BIDIRECTIONAL' },
      ...context,
    });

    expect(fake.updateRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'BIDIRECTIONAL',
        sourceMeaningId: ids.sourceMeaning,
        targetMeaningId: ids.targetMeaning,
      }),
    );
  });
});

describe('VocabularyRelationsMergeService 병합', () => {
  it('preview graph의 비교 수치와 opaque token을 반환한다', async () => {
    const fake = createFake();
    const service = new VocabularyRelationsMergeService(fake.repository);

    const preview = await service.previewMerge(
      ids.sourceVocabulary,
      ids.representativeVocabulary,
    );
    expect(preview).toMatchObject({
      source: { id: ids.sourceVocabulary, meaningCount: 1 },
      representative: {
        id: ids.representativeVocabulary,
        status: 'PUBLISHED',
      },
      comparison: { normalizedEqual: false, codePointDistance: 2 },
    });
    expect(preview.mergeToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it('이미 MERGED source가 가리키는 대표 source는 preview부터 거절한다', async () => {
    const fake = createFake();
    const source = graph(ids.sourceVocabulary, 'DRAFT');
    source.incomingMergeSourceIds = ['00000000-0000-4000-8000-000000000099'];
    fake.repository.loadMergePair = vi.fn().mockResolvedValue({
      source,
      representative: graph(ids.representativeVocabulary, 'PUBLISHED'),
    });

    await expect(
      new VocabularyRelationsMergeService(fake.repository).previewMerge(
        ids.sourceVocabulary,
        ids.representativeVocabulary,
      ),
    ).rejects.toMatchObject({ code: 'VOCABULARY_MERGE_SOURCE_INVALID' });
  });

  it('실행은 preview token과 감사 문맥을 SERIALIZABLE repository 경계로 전달한다', async () => {
    const fake = createFake();
    const service = new VocabularyRelationsMergeService(fake.repository);
    const preview = await service.previewMerge(
      ids.sourceVocabulary,
      ids.representativeVocabulary,
    );

    await service.merge({
      sourceVocabularyId: ids.sourceVocabulary,
      representativeVocabularyId: ids.representativeVocabulary,
      mergeToken: preview.mergeToken,
      ...context,
    });

    expect(fake.executeMerge).toHaveBeenCalledWith({
      sourceVocabularyId: ids.sourceVocabulary,
      representativeVocabularyId: ids.representativeVocabulary,
      expectedFingerprint: preview.mergeToken,
      actorSub: context.actorSub,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      occurredAt: context.occurredAt,
    });
  });
});

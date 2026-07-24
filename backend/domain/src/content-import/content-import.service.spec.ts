/** 동기 콘텐츠 가져오기의 hash·멱등 재개·항목별 실패 경계를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  ContentImportDetail,
  ContentImportRecord,
  ContentImportRepository,
  ContentImportResultItem,
  ContentImportStoredItem,
  SaveRejectedContentImportItemInput,
} from './content-import.repository.js';
import {
  ContentImportError,
  ContentImportService,
  hashContentImportRequest,
  type ContentImportCommand,
  type ContentImportRequest,
} from './content-import.service.js';
import { ContentDraftError } from './content-draft.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  import: '00000000-0000-4000-8000-000000000002',
  vocabulary: '00000000-0000-4000-8000-000000000003',
  question: '00000000-0000-4000-8000-000000000004',
  media: '00000000-0000-4000-8000-000000000005',
} as const;

const occurredAt = new Date('2026-07-24T00:00:00.000Z');

const vocabularyInput = (clientRef: string) => ({
  clientRef,
  thai: clientRef,
  kind: 'WORD' as const,
  meanings: [
    {
      clientRef: `${clientRef}-meaning`,
      meaningKo: '뜻',
      partOfSpeech: '명사',
    },
  ],
  pronunciations: [
    {
      clientRef: `${clientRef}-pronunciation`,
      pronunciationKo: '발음',
      toneMarks: '-',
      mediaAssetId: ids.media,
    },
  ],
});

const sentenceInput = {
  originalText: 'ก',
  translationKo: '뜻',
  pronunciationKo: '꺼',
  toneMarks: '-',
  mediaAssetId: ids.media,
  tokens: [],
  expressions: [],
};

const questionInput = (clientRef: string) => ({
  clientRef,
  questionTypeSlug: 'standard-choice',
  questionTypeVersion: 1,
  difficulty: 1,
  blocks: [
    {
      kind: 'QUESTION' as const,
      displayMode: 'TEXT' as const,
      sentences: [{ sentence: sentenceInput }],
    },
  ],
  options: [
    {
      clientRef: `${clientRef}-option`,
      position: 0,
      sentence: sentenceInput,
    },
  ],
  correctOptionRef: `${clientRef}-option`,
});

const request = (
  vocabularyRefs = ['vocabulary-0', 'vocabulary-1'],
  questionRefs = ['question-0', 'question-1'],
): ContentImportRequest => ({
  schemaVersion: 1,
  vocabularies: vocabularyRefs.map(vocabularyInput),
  questions: questionRefs.map(questionInput),
});

const command = (
  content: ContentImportRequest = request(),
): ContentImportCommand => ({
  requestedBy: ids.actor,
  idempotencyKey: '00000000-0000-4000-8000-000000000099',
  request: content,
  context: {
    actorSub: 'cognito-sub',
    actorUserId: ids.actor,
    requestId: 'request-id',
    occurredAt,
  },
});

const item = (
  kind: ContentImportStoredItem['kind'],
  sourceIndex: number,
  status: ContentImportStoredItem['status'] = 'IMPORTED',
): ContentImportStoredItem =>
  status === 'IMPORTED'
    ? {
        kind,
        sourceIndex,
        clientRef: `${kind}-${sourceIndex}`,
        status,
        targetId: kind === 'VOCABULARY' ? ids.vocabulary : ids.question,
        errors: [],
      }
    : {
        kind,
        sourceIndex,
        clientRef: `${kind}-${sourceIndex}`,
        status,
        targetId: null,
        errors: [{ path: 'path', code: 'IMPORT_CONTENT_INVALID' }],
      };

const detail = (
  items: ContentImportStoredItem[],
  status: ContentImportDetail['status'] = 'COMPLETED',
): ContentImportDetail => {
  const publicItems: ContentImportResultItem[] = items.map((stored) =>
    stored.status === 'IMPORTED'
      ? {
          kind: stored.kind,
          sourceIndex: stored.sourceIndex,
          status: stored.status,
          targetId: stored.targetId,
          errors: [],
        }
      : {
          kind: stored.kind,
          sourceIndex: stored.sourceIndex,
          status: stored.status,
          targetId: null,
          errors: stored.errors,
        },
  );
  return {
    id: ids.import,
    status,
    vocabularyCount: items.filter(({ kind }) => kind === 'VOCABULARY').length,
    questionCount: items.filter(({ kind }) => kind === 'QUESTION').length,
    importedCount: items.filter(({ status: value }) => value === 'IMPORTED')
      .length,
    rejectedCount: items.filter(({ status: value }) => value === 'REJECTED')
      .length,
    createdAt: occurredAt,
    completedAt: occurredAt,
    items: publicItems,
  };
};

interface RepositoryState {
  record?: ContentImportRecord;
  items?: ContentImportStoredItem[];
  detail?: ContentImportDetail;
}

const createRepository = (state: RepositoryState = {}) => {
  const storedItems = [...(state.items ?? [])];
  const record: ContentImportRecord = state.record ?? {
    id: ids.import,
    requestedBy: ids.actor,
    idempotencyKey: command().idempotencyKey,
    requestHash: hashContentImportRequest(request()),
    status: null,
    vocabularyCount: 2,
    questionCount: 2,
    importedCount: 0,
    rejectedCount: 0,
    createdAt: occurredAt,
    completedAt: null,
  };
  const repository: ContentImportRepository = {
    claim: vi.fn().mockResolvedValue(record),
    findItem: vi
      .fn()
      .mockImplementation(
        (_importId: string, kind: string, sourceIndex: number) =>
          Promise.resolve(
            storedItems.find(
              (stored) =>
                stored.kind === kind && stored.sourceIndex === sourceIndex,
            ) ?? null,
          ),
      ),
    saveRejectedItem: vi
      .fn()
      .mockImplementation((input: SaveRejectedContentImportItemInput) => {
        const rejected: ContentImportStoredItem = {
          kind: input.kind,
          sourceIndex: input.sourceIndex,
          clientRef: input.clientRef,
          status: 'REJECTED',
          targetId: null,
          errors: input.errors,
        };
        storedItems.push(rejected);
        return Promise.resolve(rejected);
      }),
    complete: vi.fn().mockResolvedValue(undefined),
    findDetail: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          state.detail ??
            detail(
              storedItems.length > 0
                ? storedItems
                : [
                    item('VOCABULARY', 0),
                    item('VOCABULARY', 1),
                    item('QUESTION', 0),
                    item('QUESTION', 1),
                  ],
            ),
        ),
      ),
  };
  return { repository, storedItems };
};

const createDraftService = () => ({
  createVocabularyItem: vi.fn().mockResolvedValue({
    targetId: ids.vocabulary,
    referenceMap: { ref: ids.vocabulary },
  }),
  createQuestionItem: vi.fn().mockResolvedValue({
    targetId: ids.question,
    referenceMap: { ref: ids.question },
  }),
});

describe('canonical 콘텐츠 가져오기 hash', () => {
  it('객체 key 순서와 무관한 lowercase SHA-256을 만든다', () => {
    const original = request(['first'], []);
    const reordered = {
      questions: original.questions,
      vocabularies: original.vocabularies.map((vocabulary) => ({
        pronunciations: vocabulary.pronunciations,
        kind: vocabulary.kind,
        meanings: vocabulary.meanings.map((meaning) => ({
          partOfSpeech: meaning.partOfSpeech,
          meaningKo: meaning.meaningKo,
          clientRef: meaning.clientRef,
        })),
        thai: vocabulary.thai,
        clientRef: vocabulary.clientRef,
      })),
      schemaVersion: original.schemaVersion,
    } as ContentImportRequest;

    const originalHash = hashContentImportRequest(original);

    expect(hashContentImportRequest(reordered)).toBe(originalHash);
    expect(originalHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('배열과 item 순서가 달라지면 다른 hash를 만든다', () => {
    expect(hashContentImportRequest(request(['first', 'second'], []))).not.toBe(
      hashContentImportRequest(request(['second', 'first'], [])),
    );
  });
});

describe('ContentImportService 멱등 처리', () => {
  it('완료된 같은 user·key·hash는 draft를 다시 만들지 않고 결과를 replay한다', async () => {
    const completedItems = [item('VOCABULARY', 0)];
    const completedDetail = detail(completedItems);
    const content = request(['vocabulary-0'], []);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: 'COMPLETED',
        vocabularyCount: 1,
        questionCount: 0,
        importedCount: 1,
        rejectedCount: 0,
        createdAt: occurredAt,
        completedAt: occurredAt,
      },
      detail: completedDetail,
    });
    const drafts = createDraftService();
    const service = new ContentImportService(
      fake.repository,
      drafts,
      () => ids.import,
      () => occurredAt,
    );

    await expect(service.execute(command(content))).resolves.toEqual(
      completedDetail,
    );
    expect(drafts.createVocabularyItem).not.toHaveBeenCalled();
    expect(fake.repository.complete).not.toHaveBeenCalled();
  });

  it('같은 user·key의 다른 hash는 stable conflict로 거절한다', async () => {
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command().idempotencyKey,
        requestHash: 'f'.repeat(64),
        status: null,
        vocabularyCount: 2,
        questionCount: 2,
        importedCount: 0,
        rejectedCount: 0,
        createdAt: occurredAt,
        completedAt: null,
      },
    });
    const drafts = createDraftService();
    const service = new ContentImportService(fake.repository, drafts);

    await expect(service.execute(command())).rejects.toEqual(
      new ContentImportError('CONTENT_IMPORT_IDEMPOTENCY_CONFLICT'),
    );
    expect(drafts.createVocabularyItem).not.toHaveBeenCalled();
  });

  it('미완료 같은 요청은 저장된 unique item을 건너뛰고 나머지만 source 순서로 재개한다', async () => {
    const fake = createRepository({
      items: [item('VOCABULARY', 0), item('QUESTION', 0)],
    });
    const drafts = createDraftService();
    const order: string[] = [];
    drafts.createVocabularyItem.mockImplementation(({ sourceIndex }) => {
      order.push(`VOCABULARY:${sourceIndex}`);
      return Promise.resolve({ targetId: ids.vocabulary, referenceMap: {} });
    });
    drafts.createQuestionItem.mockImplementation(({ sourceIndex }) => {
      order.push(`QUESTION:${sourceIndex}`);
      return Promise.resolve({ targetId: ids.question, referenceMap: {} });
    });
    const service = new ContentImportService(
      fake.repository,
      drafts,
      () => ids.import,
      () => occurredAt,
    );

    await service.execute(command());

    expect(order).toEqual(['VOCABULARY:1', 'QUESTION:1']);
    expect(fake.repository.complete).toHaveBeenCalledTimes(1);
  });
});

describe('ContentImportService 항목 실패 처리', () => {
  it('예상 ContentDraftError만 정확한 공개 경로·code로 REJECTED 저장하고 계속한다', async () => {
    const content = request(['bad', 'good'], ['question']);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: null,
        vocabularyCount: 2,
        questionCount: 1,
        importedCount: 0,
        rejectedCount: 0,
        createdAt: occurredAt,
        completedAt: null,
      },
    });
    const drafts = createDraftService();
    drafts.createVocabularyItem
      .mockRejectedValueOnce(
        new ContentDraftError('IMPORT_DUPLICATE_VOCABULARY', 'thai'),
      )
      .mockResolvedValueOnce({
        targetId: ids.vocabulary,
        referenceMap: {},
      });
    const service = new ContentImportService(
      fake.repository,
      drafts,
      () => ids.import,
      () => occurredAt,
    );

    await service.execute(command(content));

    expect(fake.repository.saveRejectedItem).toHaveBeenCalledWith({
      importId: ids.import,
      kind: 'VOCABULARY',
      sourceIndex: 0,
      clientRef: 'bad',
      errors: [
        {
          path: 'thai',
          code: 'IMPORT_DUPLICATE_VOCABULARY',
        },
      ],
    });
    expect(drafts.createVocabularyItem).toHaveBeenCalledTimes(2);
    expect(drafts.createQuestionItem).toHaveBeenCalledTimes(1);
  });

  it('실패한 client ref를 쓰는 question만 거절하고 다음 question을 처리한다', async () => {
    const content = request([], ['bad-question', 'good-question']);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: null,
        vocabularyCount: 0,
        questionCount: 2,
        importedCount: 0,
        rejectedCount: 0,
        createdAt: occurredAt,
        completedAt: null,
      },
    });
    const drafts = createDraftService();
    drafts.createQuestionItem
      .mockRejectedValueOnce(
        new ContentDraftError(
          'IMPORT_REFERENCE_NOT_FOUND',
          'blocks.0.sentences.0.sentence.tokens.0.vocabulary',
        ),
      )
      .mockResolvedValueOnce({
        targetId: ids.question,
        referenceMap: {},
      });
    const service = new ContentImportService(
      fake.repository,
      drafts,
      () => ids.import,
      () => occurredAt,
    );

    await service.execute(command(content));

    expect(fake.repository.saveRejectedItem).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'QUESTION',
        sourceIndex: 0,
        errors: [
          {
            path: 'blocks.0.sentences.0.sentence.tokens.0.vocabulary',
            code: 'IMPORT_REFERENCE_NOT_FOUND',
          },
        ],
      }),
    );
    expect(drafts.createQuestionItem).toHaveBeenCalledTimes(2);
  });

  it('unexpected draft 오류는 REJECTED로 위장하지 않고 요청을 실패시킨다', async () => {
    const content = request(['vocabulary'], []);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: null,
        vocabularyCount: 1,
        questionCount: 0,
        importedCount: 0,
        rejectedCount: 0,
        createdAt: occurredAt,
        completedAt: null,
      },
    });
    const drafts = createDraftService();
    const failure = new Error('private database failure');
    drafts.createVocabularyItem.mockRejectedValue(failure);
    const service = new ContentImportService(fake.repository, drafts);

    await expect(service.execute(command(content))).rejects.toBe(failure);
    expect(fake.repository.saveRejectedItem).not.toHaveBeenCalled();
    expect(fake.repository.complete).not.toHaveBeenCalled();
  });

  it('동시 item conflict는 existing item 재조회로 replay하고 거절하지 않는다', async () => {
    const content = request(['vocabulary'], []);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: null,
        vocabularyCount: 1,
        questionCount: 0,
        importedCount: 0,
        rejectedCount: 0,
        createdAt: occurredAt,
        completedAt: null,
      },
    });
    const drafts = createDraftService();
    drafts.createVocabularyItem.mockRejectedValue({
      code: 'CONTENT_DRAFT_ITEM_CONFLICT',
      operation: 'saveVocabularyDraft',
    });
    vi.mocked(fake.repository.findItem)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(item('VOCABULARY', 0));
    const service = new ContentImportService(
      fake.repository,
      drafts,
      () => ids.import,
      () => occurredAt,
    );

    await service.execute(command(content));

    expect(fake.repository.findItem).toHaveBeenCalledTimes(2);
    expect(fake.repository.saveRejectedItem).not.toHaveBeenCalled();
    expect(fake.repository.complete).toHaveBeenCalledTimes(1);
  });
});

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

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  import: '00000000-0000-4000-8000-000000000002',
  vocabulary: '00000000-0000-4000-8000-000000000003',
  question: '00000000-0000-4000-8000-000000000004',
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
});

const request = (
  vocabularyRefs = ['vocabulary-0', 'vocabulary-1'],
): ContentImportRequest => ({
  schemaVersion: 1,
  vocabularies: vocabularyRefs.map(vocabularyInput),
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
                : [item('VOCABULARY', 0), item('VOCABULARY', 1)],
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
});

describe('canonical 콘텐츠 가져오기 hash', () => {
  it('객체 key 순서와 무관한 lowercase SHA-256을 만든다', () => {
    const original = request(['first']);
    const reordered = {
      vocabularies: original.vocabularies.map((vocabulary) => ({
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
    expect(hashContentImportRequest(request(['first', 'second']))).not.toBe(
      hashContentImportRequest(request(['second', 'first'])),
    );
  });
});

describe('ContentImportService 멱등 처리', () => {
  it('완료된 같은 user·key·hash는 draft를 다시 만들지 않고 결과를 replay한다', async () => {
    const completedItems = [item('VOCABULARY', 0)];
    const completedDetail = detail(completedItems);
    const content = request(['vocabulary-0']);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: 'COMPLETED',
        vocabularyCount: 1,
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
});

describe('ContentImportService 항목 실패 처리', () => {
  it('unexpected draft 오류는 REJECTED로 위장하지 않고 요청을 실패시킨다', async () => {
    const content = request(['vocabulary']);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: null,
        vocabularyCount: 1,
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
    const content = request(['vocabulary']);
    const fake = createRepository({
      record: {
        id: ids.import,
        requestedBy: ids.actor,
        idempotencyKey: command(content).idempotencyKey,
        requestHash: hashContentImportRequest(content),
        status: null,
        vocabularyCount: 1,
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

/** 관리자 어휘 전체 교체·게시·숨김·복구의 입력 검증과 transaction 순서를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  VocabularyAdminError,
  VocabularyAdminService,
  type ReplaceVocabularyCommand,
} from './vocabulary-admin.js';
import type {
  VocabularyAdminLockedGraph,
  VocabularyAdminRepository,
  VocabularyAdminTransaction,
} from './vocabulary-admin.repository.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  vocabulary: '00000000-0000-4000-8000-000000000002',
  oldMeaning: '00000000-0000-4000-8000-000000000003',
  newMeaning: '00000000-0000-4000-8000-000000000006',
  nil: '00000000-0000-0000-0000-000000000000',
  max: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
} as const;

const context = {
  actorSub: 'cognito-sub',
  actorUserId: ids.actor,
  requestId: 'request-id',
  occurredAt: new Date('2026-07-24T00:00:00.000Z'),
} as const;

const lockedGraph = (
  status: VocabularyAdminLockedGraph['vocabulary']['status'] = 'DRAFT',
): VocabularyAdminLockedGraph => ({
  vocabulary: {
    id: ids.vocabulary,
    thai: 'เดิม',
    normalizedThai: 'เดิม',
    kind: 'WORD',
    status,
  },
  meanings: [{ id: ids.oldMeaning }],
});

const replaceInput = (): ReplaceVocabularyCommand['input'] => ({
  thai: '  สวัสดี\u200B   ครับ  ',
  kind: 'EXPRESSION',
  meanings: [
    {
      clientRef: 'meaning.greeting',
      meaningKo: '안녕하세요',
      partOfSpeech: '감탄사',
      difficulty: 1,
      contextNote: null,
    },
  ],
});

const createFake = (
  overrides: {
    duplicateId?: string | null;
    graph?: VocabularyAdminLockedGraph | null;
    used?: boolean;
  } = {},
) => {
  const calls: string[] = [];
  const lockVocabularyGraph = vi
    .fn<VocabularyAdminTransaction['lockVocabularyGraph']>()
    .mockImplementation(() => {
      calls.push('lockVocabularyGraph');
      return Promise.resolve(
        overrides.graph === undefined ? lockedGraph() : overrides.graph,
      );
    });
  const findDuplicateVocabularyId = vi
    .fn<VocabularyAdminTransaction['findDuplicateVocabularyId']>()
    .mockImplementation(() => {
      calls.push('findDuplicateVocabularyId');
      return Promise.resolve(overrides.duplicateId ?? null);
    });
  const replaceVocabulary = vi
    .fn<VocabularyAdminTransaction['replaceVocabulary']>()
    .mockImplementation(() => {
      calls.push('replaceVocabulary');
      return Promise.resolve();
    });
  const transitionVocabularyStatus = vi
    .fn<VocabularyAdminTransaction['transitionVocabularyStatus']>()
    .mockImplementation(() => {
      calls.push('transitionVocabularyStatus');
      return Promise.resolve();
    });
  const appendAuditLog = vi
    .fn<VocabularyAdminTransaction['appendAuditLog']>()
    .mockImplementation(() => {
      calls.push('appendAuditLog');
      return Promise.resolve();
    });
  const transaction: VocabularyAdminTransaction = {
    setImportanceWeight: vi.fn(),
    lockVocabularyGraph,
    findDuplicateVocabularyId,
    replaceVocabulary,
    transitionVocabularyStatus,
    appendAuditLog,
  };
  const runInTransaction = vi
    .fn<
      (
        work: (transaction: VocabularyAdminTransaction) => Promise<unknown>,
      ) => Promise<unknown>
    >()
    .mockImplementation((work) => work(transaction));
  const repository: VocabularyAdminRepository = {
    runInTransaction: <T>(
      work: (transaction: VocabularyAdminTransaction) => Promise<T>,
    ): Promise<T> => runInTransaction(work) as Promise<T>,
  };
  return {
    appendAuditLog,
    calls,
    findDuplicateVocabularyId,
    lockVocabularyGraph,
    replaceVocabulary,
    repository,
    runInTransaction,
    transitionVocabularyStatus,
  };
};

describe('VocabularyAdminService 어휘 전체 교체', () => {
  it('자기 자신을 제외한 normalized exact duplicate를 안정 오류로 거절한다', async () => {
    const fake = createFake({
      duplicateId: '00000000-0000-4000-8000-000000000099',
    });
    const service = new VocabularyAdminService(fake.repository);

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input: replaceInput(),
        ...context,
      }),
    ).rejects.toEqual(new VocabularyAdminError('VOCABULARY_DUPLICATE', 'thai'));
    expect(fake.findDuplicateVocabularyId).toHaveBeenCalledWith(
      'สวัสดี ครับ',
      ids.vocabulary,
    );
    expect(fake.replaceVocabulary).not.toHaveBeenCalled();
  });

  it('중복 뜻 clientRef를 거절한다', async () => {
    const fake = createFake();
    const service = new VocabularyAdminService(fake.repository);
    const duplicate = replaceInput();
    duplicate.meanings.push({ ...duplicate.meanings[0]! });

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input: duplicate,
        ...context,
      }),
    ).rejects.toMatchObject({ code: 'VOCABULARY_CONTENT_INVALID' });
    expect(fake.runInTransaction).not.toHaveBeenCalled();
  });

  it('typed bypass의 unknown key·sparse array·범위·UUID를 strict 공개 계약과 같게 거절한다', async () => {
    const invalidInputs: Array<{ input: unknown; path: string }> = [
      { input: { ...replaceInput(), internal: true }, path: 'vocabulary' },
      {
        input: {
          ...replaceInput(),
          meanings: Object.assign(new Array(1), {}),
        },
        path: 'meanings.0',
      },
      {
        input: {
          ...replaceInput(),
          meanings: [{ ...replaceInput().meanings[0], difficulty: 1.5 }],
        },
        path: 'meanings.0.difficulty',
      },
    ];

    for (const candidate of invalidInputs) {
      const fake = createFake();
      const service = new VocabularyAdminService(fake.repository);
      await expect(
        service.replace({
          vocabularyId: ids.vocabulary,
          input: candidate.input as never,
          ...context,
        }),
      ).rejects.toEqual(
        new VocabularyAdminError('VOCABULARY_CONTENT_INVALID', candidate.path),
      );
      expect(fake.runInTransaction).not.toHaveBeenCalled();
    }
  });

  it('Zod UUID의 nil·max semantics와 optional nullable field를 동일하게 허용한다', async () => {
    const fake = createFake({});
    const input = replaceInput();
    delete input.meanings[0]!.difficulty;
    delete input.meanings[0]!.contextNote;
    const generatedIds = [
      ids.newMeaning,
      '00000000-0000-4000-8000-000000000008',
    ];
    const service = new VocabularyAdminService(fake.repository, () =>
      generatedIds.shift()!,
    );

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input,
        ...context,
      }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
    expect(fake.replaceVocabulary).toHaveBeenCalledWith(
      expect.objectContaining({
        meanings: [
          expect.objectContaining({ difficulty: null, contextNote: null }),
        ],
      }),
    );
  });

  it('새 뜻에 생성된 UUID가 서로 중복되면 graph를 저장하지 않는다', async () => {
    const fake = createFake();
    const service = new VocabularyAdminService(
      fake.repository,
      () => ids.newMeaning,
    );

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input: {
          ...replaceInput(),
          meanings: [
            ...replaceInput().meanings,
            { ...replaceInput().meanings[0]!, clientRef: 'second' },
          ],
        },
        ...context,
      }),
    ).rejects.toEqual(
      new VocabularyAdminError('VOCABULARY_CONTENT_INVALID', 'generatedId'),
    );
    expect(fake.replaceVocabulary).not.toHaveBeenCalled();
    expect(fake.appendAuditLog).not.toHaveBeenCalled();
  });
});

describe('VocabularyAdminService 게시·노출 상태', () => {
  it('PUBLISHED→HIDDEN과 HIDDEN→PUBLISHED exact 전이만 변경과 audit을 묶는다', async () => {
    const published = createFake({ graph: lockedGraph('PUBLISHED') });
    const hidden = createFake({ graph: lockedGraph('HIDDEN') });

    await expect(
      new VocabularyAdminService(published.repository).hide({
        vocabularyId: ids.vocabulary,
        ...context,
      }),
    ).resolves.toEqual({ id: ids.vocabulary, status: 'HIDDEN' });
    await expect(
      new VocabularyAdminService(hidden.repository).restore({
        vocabularyId: ids.vocabulary,
        ...context,
      }),
    ).resolves.toEqual({ id: ids.vocabulary, status: 'PUBLISHED' });
    expect(published.transitionVocabularyStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: 'PUBLISHED',
        nextStatus: 'HIDDEN',
        publishedAt: undefined,
      }),
    );
    expect(hidden.transitionVocabularyStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: 'HIDDEN',
        nextStatus: 'PUBLISHED',
        publishedAt: context.occurredAt,
      }),
    );

    const wrong = createFake({ graph: lockedGraph('DRAFT') });
    await expect(
      new VocabularyAdminService(wrong.repository).hide({
        vocabularyId: ids.vocabulary,
        ...context,
      }),
    ).rejects.toMatchObject({ code: 'VOCABULARY_STATE_CONFLICT' });
    expect(wrong.appendAuditLog).not.toHaveBeenCalled();
  });

  it('대상이 없거나 audit이 실패하면 성공으로 처리하지 않는다', async () => {
    const missing = createFake({ graph: null });
    await expect(
      new VocabularyAdminService(missing.repository).publish({
        vocabularyId: ids.vocabulary,
        ...context,
      }),
    ).rejects.toEqual(new VocabularyAdminError('VOCABULARY_NOT_FOUND'));

    const auditFailure = createFake();
    auditFailure.appendAuditLog.mockRejectedValueOnce(new Error('audit-fail'));
    await expect(
      new VocabularyAdminService(auditFailure.repository).publish({
        vocabularyId: ids.vocabulary,
        ...context,
      }),
    ).rejects.toThrow('audit-fail');
  });
});

/** 관리자 어휘 전체 교체·게시·숨김·복구의 입력 검증과 transaction 순서를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  VocabularyAdminLockedGraph,
  VocabularyAdminRepository,
  VocabularyAdminTransaction,
} from './vocabulary-admin.repository.js';
import {
  VocabularyAdminError,
  VocabularyAdminService,
  type ReplaceVocabularyCommand,
} from './vocabulary-admin.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  vocabulary: '00000000-0000-4000-8000-000000000002',
  oldMeaning: '00000000-0000-4000-8000-000000000003',
  oldPronunciation: '00000000-0000-4000-8000-000000000004',
  media: '00000000-0000-4000-8000-000000000005',
  newMeaning: '00000000-0000-4000-8000-000000000006',
  newPronunciation: '00000000-0000-4000-8000-000000000007',
  nil: '00000000-0000-0000-0000-000000000000',
  max: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
} as const;

const context = {
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
  pronunciations: [{ id: ids.oldPronunciation, mediaAssetId: ids.media }],
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
  pronunciations: [
    {
      clientRef: 'pronunciation.greeting',
      pronunciationKo: '싸왓디 크랍',
      toneMarks: 'L-L-M-H',
      mediaAssetId: ids.media,
    },
  ],
  meaningPronunciations: [
    {
      meaningRef: 'meaning.greeting',
      pronunciationRef: 'pronunciation.greeting',
    },
  ],
});

const createFake = (
  overrides: {
    duplicateId?: string | null;
    graph?: VocabularyAdminLockedGraph | null;
    media?: Array<{ id: string; status: 'UPLOADING' | 'READY' | 'REJECTED' }>;
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
  const hasQuestionUsage = vi
    .fn<VocabularyAdminTransaction['hasQuestionUsage']>()
    .mockImplementation(() => {
      calls.push('hasQuestionUsage');
      return Promise.resolve(overrides.used ?? false);
    });
  const findMediaAssetsByIds = vi
    .fn<VocabularyAdminTransaction['findMediaAssetsByIds']>()
    .mockImplementation(() => {
      calls.push('findMediaAssetsByIds');
      return Promise.resolve(
        overrides.media ?? [{ id: ids.media, status: 'READY' as const }],
      );
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
    lockVocabularyGraph,
    findDuplicateVocabularyId,
    hasQuestionUsage,
    findMediaAssetsByIds,
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
    findMediaAssetsByIds,
    hasQuestionUsage,
    lockVocabularyGraph,
    replaceVocabulary,
    repository,
    runInTransaction,
    transitionVocabularyStatus,
  };
};

describe('VocabularyAdminService 어휘 전체 교체', () => {
  it('DRAFT와 기존 child 사용 여부를 확인하고 새 UUID·mapping graph와 audit을 저장한다', async () => {
    const fake = createFake();
    const generatedIds = [ids.newMeaning, ids.newPronunciation];
    const service = new VocabularyAdminService(fake.repository, () =>
      generatedIds.shift()!,
    );

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input: replaceInput(),
        ...context,
      }),
    ).resolves.toEqual({
      id: ids.vocabulary,
      status: 'DRAFT',
    });

    expect(fake.calls).toEqual([
      'lockVocabularyGraph',
      'hasQuestionUsage',
      'findDuplicateVocabularyId',
      'findMediaAssetsByIds',
      'replaceVocabulary',
      'appendAuditLog',
    ]);
    expect(fake.hasQuestionUsage).toHaveBeenCalledWith({
      vocabularyId: ids.vocabulary,
      meaningIds: [ids.oldMeaning],
      pronunciationIds: [ids.oldPronunciation],
    });
    expect(fake.replaceVocabulary).toHaveBeenCalledWith({
      vocabulary: {
        id: ids.vocabulary,
        thai: '  สวัสดี\u200B   ครับ  ',
        normalizedThai: 'สวัสดี ครับ',
        kind: 'EXPRESSION',
        status: 'DRAFT',
        updatedAt: context.occurredAt,
      },
      meanings: [
        {
          id: ids.newMeaning,
          vocabularyId: ids.vocabulary,
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      pronunciations: [
        {
          id: ids.newPronunciation,
          vocabularyId: ids.vocabulary,
          pronunciationKo: '싸왓디 크랍',
          toneMarks: 'L-L-M-H',
          mediaAssetId: ids.media,
        },
      ],
      meaningPronunciations: [
        {
          vocabularyId: ids.vocabulary,
          meaningId: ids.newMeaning,
          pronunciationId: ids.newPronunciation,
        },
      ],
    });
    expect(fake.appendAuditLog).toHaveBeenCalledWith({
      actorUserId: ids.actor,
      action: 'VOCABULARY_REPLACED',
      targetType: 'VOCABULARY',
      targetId: ids.vocabulary,
      summary: {
        kind: 'EXPRESSION',
        meaningCount: 1,
        pronunciationCount: 1,
      },
      requestId: 'request-id',
      occurredAt: context.occurredAt,
    });
  });

  it('question token·expression 또는 기존 child가 사용 중이면 교체와 audit을 남기지 않는다', async () => {
    const fake = createFake({ used: true });
    const service = new VocabularyAdminService(fake.repository);

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input: replaceInput(),
        ...context,
      }),
    ).rejects.toEqual(new VocabularyAdminError('VOCABULARY_IN_USE'));
    expect(fake.replaceVocabulary).not.toHaveBeenCalled();
    expect(fake.appendAuditLog).not.toHaveBeenCalled();
  });

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

  it('명시적 mapping의 모든 ref를 해석하고 child ref·mapping pair 중복을 거절한다', async () => {
    const fake = createFake();
    const service = new VocabularyAdminService(fake.repository);
    const missing = replaceInput();
    missing.meaningPronunciations[0]!.meaningRef = 'meaning.missing';
    const duplicate = replaceInput();
    duplicate.meanings.push({ ...duplicate.meanings[0]! });

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input: missing,
        ...context,
      }),
    ).rejects.toEqual(
      new VocabularyAdminError(
        'VOCABULARY_CONTENT_INVALID',
        'meaningPronunciations.0.meaningRef',
      ),
    );
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
      {
        input: {
          ...replaceInput(),
          pronunciations: [
            {
              ...replaceInput().pronunciations[0],
              mediaAssetId: 'not-a-uuid',
            },
          ],
        },
        path: 'pronunciations.0.mediaAssetId',
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
    const fake = createFake({
      media: [
        { id: ids.nil, status: 'UPLOADING' },
        { id: ids.max, status: 'REJECTED' },
      ],
    });
    const input = replaceInput();
    delete input.meanings[0]!.difficulty;
    delete input.meanings[0]!.contextNote;
    input.pronunciations = [
      { ...input.pronunciations[0]!, clientRef: 'nil', mediaAssetId: ids.nil },
      { ...input.pronunciations[0]!, clientRef: 'max', mediaAssetId: ids.max },
    ];
    input.meaningPronunciations = [
      { meaningRef: 'meaning.greeting', pronunciationRef: 'nil' },
      { meaningRef: 'meaning.greeting', pronunciationRef: 'max' },
    ];
    const generatedIds = [
      ids.newMeaning,
      ids.newPronunciation,
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

  it('DRAFT가 아니거나 media ref가 사라졌거나 생성 UUID가 비정상이면 변경하지 않는다', async () => {
    const published = createFake({ graph: lockedGraph('PUBLISHED') });
    await expect(
      new VocabularyAdminService(published.repository).replace({
        vocabularyId: ids.vocabulary,
        input: replaceInput(),
        ...context,
      }),
    ).rejects.toMatchObject({ code: 'VOCABULARY_STATE_CONFLICT' });

    const missingMedia = createFake({ media: [] });
    await expect(
      new VocabularyAdminService(missingMedia.repository).replace({
        vocabularyId: ids.vocabulary,
        input: replaceInput(),
        ...context,
      }),
    ).rejects.toMatchObject({ code: 'VOCABULARY_MEDIA_NOT_FOUND' });

    const invalidGeneratedId = createFake();
    await expect(
      new VocabularyAdminService(
        invalidGeneratedId.repository,
        () => ids.nil,
      ).replace({
        vocabularyId: ids.vocabulary,
        input: replaceInput(),
        ...context,
      }),
    ).rejects.toMatchObject({
      code: 'VOCABULARY_CONTENT_INVALID',
      path: 'generatedId',
    });
  });

  it('새 meaning·pronunciation에 생성된 UUID가 서로 중복되면 graph를 저장하지 않는다', async () => {
    const fake = createFake();
    const service = new VocabularyAdminService(
      fake.repository,
      () => ids.newMeaning,
    );

    await expect(
      service.replace({
        vocabularyId: ids.vocabulary,
        input: replaceInput(),
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
  it('DRAFT에 발음이 하나 이상 있고 연결된 모든 current media가 READY일 때 게시·audit한다', async () => {
    const fake = createFake();
    const service = new VocabularyAdminService(fake.repository);

    await expect(
      service.publish({ vocabularyId: ids.vocabulary, ...context }),
    ).resolves.toEqual({ id: ids.vocabulary, status: 'PUBLISHED' });
    expect(fake.calls).toEqual([
      'lockVocabularyGraph',
      'findMediaAssetsByIds',
      'transitionVocabularyStatus',
      'appendAuditLog',
    ]);
    expect(fake.transitionVocabularyStatus).toHaveBeenCalledWith({
      vocabularyId: ids.vocabulary,
      expectedStatus: 'DRAFT',
      nextStatus: 'PUBLISHED',
      updatedAt: context.occurredAt,
    });
  });

  it('발음이 없거나 linked media가 READY가 아니면 게시와 audit을 남기지 않는다', async () => {
    const noPronunciation = createFake({
      graph: { ...lockedGraph(), pronunciations: [] },
    });
    const uploading = createFake({
      media: [{ id: ids.media, status: 'UPLOADING' }],
    });

    for (const fake of [noPronunciation, uploading]) {
      await expect(
        new VocabularyAdminService(fake.repository).publish({
          vocabularyId: ids.vocabulary,
          ...context,
        }),
      ).rejects.toMatchObject({ code: 'VOCABULARY_AUDIO_NOT_READY' });
      expect(fake.transitionVocabularyStatus).not.toHaveBeenCalled();
      expect(fake.appendAuditLog).not.toHaveBeenCalled();
    }
  });

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
      }),
    );
    expect(hidden.transitionVocabularyStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: 'HIDDEN',
        nextStatus: 'PUBLISHED',
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

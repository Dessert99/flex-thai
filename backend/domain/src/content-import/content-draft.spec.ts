/** canonical 콘텐츠 초안의 참조 해석·검증·원자 저장 경계를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  ContentDraftRepository,
  ContentDraftTransaction,
  ImportedVocabularyReferenceItem,
  VocabularyReferenceRecord,
} from './content-draft.repository.js';
import {
  ContentDraftService,
  type CreateQuestionDraftCommand,
  type CreateVocabularyDraftCommand,
} from './content-draft.js';
import type {
  CanonicalDraftSentenceInput,
  ContentDraftAuditContext,
} from './content-import.js';
import type { MediaAsset } from '../media/media-asset.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  import: '00000000-0000-4000-8000-000000000002',
  media: '00000000-0000-4000-8000-000000000003',
  vocabulary: '00000000-0000-4000-8000-000000000004',
  meaning: '00000000-0000-4000-8000-000000000005',
  pronunciation: '00000000-0000-4000-8000-000000000006',
  expression: '00000000-0000-4000-8000-000000000007',
  typeVersion: '00000000-0000-4000-8000-000000000008',
  otherVocabulary: '00000000-0000-4000-8000-000000000009',
} as const;

const occurredAt = new Date('2026-07-24T00:00:00.000Z');
const context: ContentDraftAuditContext = {
  actorSub: 'cognito-sub',
  actorUserId: ids.actor,
  requestId: 'request-id',
  occurredAt,
};

const readyMedia = (
  id = ids.media,
  status: MediaAsset['status'] = 'READY',
): MediaAsset => {
  const base = {
    id,
    kind: 'AUDIO' as const,
    storageKey: `audio/${id}`,
    declaredMimeType: 'audio/mpeg',
    declaredSizeBytes: 3,
    declaredSha256: 'a'.repeat(64),
  };
  if (status === 'READY') {
    return {
      ...base,
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256: 'a'.repeat(64),
      status,
      readyAt: occurredAt,
    };
  }
  if (status === 'REJECTED') {
    return {
      ...base,
      mimeType: 'audio/ogg',
      sizeBytes: 4,
      sha256: 'b'.repeat(64),
      status,
      readyAt: null,
    };
  }
  return {
    ...base,
    mimeType: null,
    sizeBytes: null,
    sha256: null,
    status,
    readyAt: null,
  };
};

const importedWord: ImportedVocabularyReferenceItem = {
  itemId: '00000000-0000-4000-8000-000000000010',
  clientRef: 'word-ref',
  targetId: ids.vocabulary,
  referenceMap: {
    'word-ref': ids.vocabulary,
    'meaning-ref': ids.meaning,
    'pronunciation-ref': ids.pronunciation,
  },
};

const importedExpression: ImportedVocabularyReferenceItem = {
  itemId: '00000000-0000-4000-8000-000000000011',
  clientRef: 'expression-ref',
  targetId: ids.expression,
  referenceMap: {
    'expression-ref': ids.expression,
  },
};

interface TransactionOptions {
  duplicateVocabularyId?: string | null;
  mediaAssets?: MediaAsset[];
  importedItems?: ImportedVocabularyReferenceItem[];
  vocabularies?: VocabularyReferenceRecord[];
  meanings?: Array<{ id: string; vocabularyId: string }>;
  pronunciations?: Array<{
    id: string;
    vocabularyId: string;
    mediaAssetId: string | null;
  }>;
  questionTypeExists?: boolean;
}

const createTransaction = (
  options: TransactionOptions = {},
): ContentDraftTransaction => {
  const mediaAssets = options.mediaAssets ?? [readyMedia()];
  const importedItems = options.importedItems ?? [
    importedWord,
    importedExpression,
  ];
  const vocabularies = options.vocabularies ?? [
    { id: ids.vocabulary, kind: 'WORD', status: 'DRAFT' },
    { id: ids.expression, kind: 'EXPRESSION', status: 'DRAFT' },
  ];
  const meanings = options.meanings ?? [
    { id: ids.meaning, vocabularyId: ids.vocabulary },
  ];
  const pronunciations = options.pronunciations ?? [
    {
      id: ids.pronunciation,
      vocabularyId: ids.vocabulary,
      mediaAssetId: ids.media,
    },
  ];

  return {
    findVocabularyByNormalizedThai: vi
      .fn()
      .mockResolvedValue(
        options.duplicateVocabularyId === undefined
          ? null
          : options.duplicateVocabularyId,
      ),
    findMediaAssetById: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(mediaAssets.find((asset) => asset.id === id) ?? null),
      ),
    findSuccessfulVocabularyImportItemsByReference: vi
      .fn()
      .mockImplementation((_importId: string, clientRef: string) =>
        Promise.resolve(
          importedItems.filter(
            (item) => item.referenceMap[clientRef] !== undefined,
          ),
        ),
      ),
    findVocabularyById: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          vocabularies.find((vocabulary) => vocabulary.id === id) ?? null,
        ),
      ),
    findVocabularyMeaningById: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(meanings.find((meaning) => meaning.id === id) ?? null),
      ),
    findVocabularyPronunciationById: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          pronunciations.find((pronunciation) => pronunciation.id === id) ??
            null,
        ),
      ),
    findQuestionTypeVersion: vi.fn().mockResolvedValue(
      options.questionTypeExists === false
        ? null
        : {
            id: ids.typeVersion,
            slug: 'standard-choice',
            version: 1,
            template: 'STANDARD_CHOICE',
            optionCount: 2,
          },
    ),
    saveVocabularyDraft: vi.fn().mockResolvedValue(undefined),
    saveQuestionDraft: vi.fn().mockResolvedValue(undefined),
  };
};

const createRepository = (
  transaction: ContentDraftTransaction,
): ContentDraftRepository => {
  const repository: ContentDraftRepository = {
    async runInTransaction<T>(
      this: void,
      work: (current: ContentDraftTransaction) => Promise<T>,
    ): Promise<T> {
      return work(transaction);
    },
  };
  vi.spyOn(repository, 'runInTransaction');
  return repository;
};

const createIdGenerator = () => {
  let sequence = 100;
  return vi.fn(
    () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
  );
};

const vocabularyCommand = (
  overrides: Partial<CreateVocabularyDraftCommand['input']> = {},
): CreateVocabularyDraftCommand => ({
  importId: ids.import,
  sourceIndex: 0,
  context,
  input: {
    clientRef: 'vocabulary-ref',
    thai: '  สวัสดี\u200B   ครับ  ',
    kind: 'EXPRESSION',
    meanings: [
      {
        clientRef: 'meaning-1',
        meaningKo: '안녕하세요',
        partOfSpeech: '감탄사',
      },
      {
        clientRef: 'meaning-2',
        meaningKo: '인사',
        partOfSpeech: '명사',
        difficulty: 1,
        contextNote: null,
      },
    ],
    pronunciations: [
      {
        clientRef: 'pronunciation-1',
        pronunciationKo: '싸왓디',
        toneMarks: 'LHL',
        mediaAssetId: ids.media,
      },
      {
        clientRef: 'pronunciation-2',
        pronunciationKo: '크랍',
        toneMarks: 'H',
        mediaAssetId: ids.media,
      },
    ],
    ...overrides,
  },
});

const sentenceInput = (): CanonicalDraftSentenceInput => ({
  originalText: 'กข',
  translationKo: '번역',
  pronunciationKo: '발음',
  toneMarks: '성조',
  mediaAssetId: ids.media,
  tokens: [
    {
      surface: 'ก',
      startOffset: 0,
      endOffset: 1,
      vocabulary: { clientRef: 'word-ref' },
      meaning: { clientRef: 'meaning-ref' },
      pronunciation: { clientRef: 'pronunciation-ref' },
      contextMeaningKo: '첫째',
      role: 'TARGET',
    },
    {
      surface: 'ข',
      startOffset: 1,
      endOffset: 2,
      vocabulary: { clientRef: 'word-ref' },
      meaning: { clientRef: 'meaning-ref' },
      pronunciation: { clientRef: 'pronunciation-ref' },
      contextMeaningKo: '둘째',
      role: 'SUPPORTING',
    },
  ],
  expressions: [
    {
      startTokenIndex: 0,
      endTokenIndex: 2,
      vocabulary: { clientRef: 'expression-ref' },
      representative: true,
    },
  ],
});

const questionCommand = (
  sentence = sentenceInput(),
): CreateQuestionDraftCommand => ({
  importId: ids.import,
  sourceIndex: 0,
  context,
  input: {
    clientRef: 'question-ref',
    questionTypeSlug: 'standard-choice',
    questionTypeVersion: 1,
    difficulty: 2,
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        sentences: [{ sentence }],
      },
    ],
    options: [
      {
        clientRef: 'option-1',
        position: 0,
        sentence: sentenceInput(),
      },
      {
        clientRef: 'option-2',
        position: 1,
        sentence: sentenceInput(),
      },
    ],
    correctOptionRef: 'option-2',
  },
});

describe('ContentDraftService 어휘 초안', () => {
  it('정규화와 뜻·발음 all-to-all mapping을 원자 저장하고 내부 참조 map을 반환한다', async () => {
    const transaction = createTransaction({
      mediaAssets: [readyMedia(ids.media, 'UPLOADING')],
    });
    const repository = createRepository(transaction);
    const service = new ContentDraftService(repository, createIdGenerator());

    const result = await service.createVocabularyItem(vocabularyCommand());

    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.saveVocabularyDraft).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(transaction.saveVocabularyDraft).mock.calls[0]![0];
    expect(saved.graph.vocabulary).toMatchObject({
      id: result.targetId,
      thai: '  สวัสดี\u200B   ครับ  ',
      normalizedThai: 'สวัสดี ครับ',
      kind: 'EXPRESSION',
      status: 'DRAFT',
    });
    expect(saved.graph.meaningPronunciations).toHaveLength(4);
    expect(saved.item).toMatchObject({
      importId: ids.import,
      kind: 'VOCABULARY',
      sourceIndex: 0,
      clientRef: 'vocabulary-ref',
      status: 'IMPORTED',
      targetId: result.targetId,
      errors: [],
      referenceMap: result.referenceMap,
    });
    expect(Object.keys(result.referenceMap)).toEqual([
      'vocabulary-ref',
      'meaning-1',
      'meaning-2',
      'pronunciation-1',
      'pronunciation-2',
    ]);
    expect(saved.audit).toEqual({
      ...context,
      action: 'CONTENT_VOCABULARY_DRAFT_IMPORTED',
      targetType: 'VOCABULARY',
      targetId: result.targetId,
      summary: { importId: ids.import, sourceIndex: 0 },
    });
  });

  it('어휘 자식 __proto__ clientRef를 own JSON key로 보존한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const command = vocabularyCommand();
    command.input.meanings[0] = {
      ...command.input.meanings[0]!,
      clientRef: '__proto__',
    };

    const result = await service.createVocabularyItem(command);

    const saved = vi.mocked(transaction.saveVocabularyDraft).mock.calls[0]![0];
    const meaningId = saved.graph.meanings[0]!.id;
    expect(Object.getPrototypeOf(result.referenceMap)).toBe(Object.prototype);
    expect(Object.hasOwn(result.referenceMap, '__proto__')).toBe(true);
    expect(result.referenceMap['__proto__']).toBe(meaningId);
    expect(result.referenceMap).toEqual(
      Object.fromEntries([
        ['vocabulary-ref', result.targetId],
        ['__proto__', meaningId],
        ['meaning-2', saved.graph.meanings[1]!.id],
        ['pronunciation-1', saved.graph.pronunciations[0]!.id],
        ['pronunciation-2', saved.graph.pronunciations[1]!.id],
      ]),
    );
    expect(JSON.parse(JSON.stringify(result.referenceMap))).toMatchObject({
      ['__proto__']: meaningId,
    });
  });

  it('어휘의 top-level과 다른 prototype-like clientRef도 own JSON key로 보존한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const command = vocabularyCommand();
    command.input.clientRef = '__proto__';
    command.input.meanings[0] = {
      ...command.input.meanings[0]!,
      clientRef: 'constructor',
    };
    command.input.pronunciations[0] = {
      ...command.input.pronunciations[0]!,
      clientRef: 'toString',
    };

    const result = await service.createVocabularyItem(command);

    expect(
      ['__proto__', 'constructor', 'toString'].every((key) =>
        Object.hasOwn(result.referenceMap, key),
      ),
    ).toBe(true);
    const serialized = JSON.stringify(result.referenceMap);
    expect(serialized).toContain(`"__proto__":"${result.targetId}"`);
    expect(serialized).toContain('"constructor":"');
    expect(serialized).toContain('"toString":"');
  });

  it('뜻과 발음 사이의 중복 clientRef를 저장 전에 거절한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const command = vocabularyCommand();
    command.input.pronunciations[0] = {
      ...command.input.pronunciations[0]!,
      clientRef: 'meaning-1',
    };

    await expect(service.createVocabularyItem(command)).rejects.toMatchObject({
      code: 'IMPORT_CONTENT_INVALID',
      path: 'meanings',
    });
    expect(transaction.saveVocabularyDraft).not.toHaveBeenCalled();
  });

  it('어휘 item과 자식 clientRef 충돌로 reference map target을 덮어쓰지 않는다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const command = vocabularyCommand();
    command.input.meanings[0] = {
      ...command.input.meanings[0]!,
      clientRef: command.input.clientRef,
    };

    await expect(service.createVocabularyItem(command)).rejects.toMatchObject({
      code: 'IMPORT_CONTENT_INVALID',
      path: 'meanings',
    });
    expect(transaction.saveVocabularyDraft).not.toHaveBeenCalled();
  });

  it('존재하지 않는 발음 media를 안정적인 참조 오류로 거절한다', async () => {
    const transaction = createTransaction({ mediaAssets: [] });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createVocabularyItem(vocabularyCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'pronunciations.0.mediaAssetId',
    });
    expect(transaction.saveVocabularyDraft).not.toHaveBeenCalled();
  });

  it('정규화가 같은 기존 어휘가 있으면 stable duplicate 오류로 거절한다', async () => {
    const transaction = createTransaction({
      duplicateVocabularyId: ids.vocabulary,
    });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createVocabularyItem(vocabularyCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_DUPLICATE_VOCABULARY',
      path: 'thai',
    });
    expect(transaction.saveVocabularyDraft).not.toHaveBeenCalled();
  });

  it('UUID가 아닌 생성 결과는 저장 전에 stable content 오류로 거절한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      () => 'not-a-uuid',
    );

    await expect(
      service.createVocabularyItem(vocabularyCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_CONTENT_INVALID',
      path: 'generatedId',
    });
    expect(transaction.saveVocabularyDraft).not.toHaveBeenCalled();
  });
});

describe('ContentDraftService 문제 초안', () => {
  it('같은 import의 성공 참조를 해석해 question과 version 1 DRAFT를 원자 저장한다', async () => {
    const transaction = createTransaction();
    const repository = createRepository(transaction);
    const service = new ContentDraftService(repository, createIdGenerator());

    const result = await service.createQuestionItem(questionCommand());

    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.saveQuestionDraft).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(transaction.saveQuestionDraft).mock.calls[0]![0];
    expect(saved.graph.question).toEqual({
      id: result.targetId,
      status: 'DRAFT',
      currentPublishedVersionId: null,
    });
    expect(saved.graph.version).toMatchObject({
      questionId: result.targetId,
      version: 1,
      typeVersionId: ids.typeVersion,
      difficulty: 2,
      status: 'DRAFT',
      validationStatus: 'PENDING',
      validationIssues: [],
      validatedAt: null,
      publishedAt: null,
    });
    expect(saved.graph.sentences).toHaveLength(3);
    expect(saved.graph.sentences[0]?.tokens).toEqual([
      expect.objectContaining({
        position: 0,
        vocabularyId: ids.vocabulary,
        meaningId: ids.meaning,
        pronunciationId: ids.pronunciation,
      }),
      expect.objectContaining({
        position: 1,
        vocabularyId: ids.vocabulary,
      }),
    ]);
    expect(saved.graph.sentences[0]?.expressions).toEqual([
      expect.objectContaining({
        vocabularyId: ids.expression,
        vocabularyKind: 'EXPRESSION',
        representative: true,
      }),
    ]);
    expect(saved.graph.options.map(({ isCorrect }) => isCorrect)).toEqual([
      false,
      true,
    ]);
    expect(result.referenceMap).toEqual({
      'question-ref': result.targetId,
      'option-1': saved.graph.options[0]!.id,
      'option-2': saved.graph.options[1]!.id,
    });
    expect(saved.item.referenceMap).toEqual(result.referenceMap);
    expect(saved.audit).toMatchObject({
      ...context,
      action: 'CONTENT_QUESTION_DRAFT_IMPORTED',
      targetType: 'QUESTION',
      targetId: result.targetId,
    });
  });

  it('question option __proto__ clientRef를 own JSON key로 보존한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const command = questionCommand();
    command.input.options[0] = {
      ...command.input.options[0]!,
      clientRef: '__proto__',
    };

    const result = await service.createQuestionItem(command);

    const saved = vi.mocked(transaction.saveQuestionDraft).mock.calls[0]![0];
    const optionId = saved.graph.options[0]!.id;
    expect(Object.getPrototypeOf(result.referenceMap)).toBe(Object.prototype);
    expect(Object.hasOwn(result.referenceMap, '__proto__')).toBe(true);
    expect(result.referenceMap['__proto__']).toBe(optionId);
    expect(result.referenceMap).toEqual(
      Object.fromEntries([
        ['question-ref', result.targetId],
        ['__proto__', optionId],
        ['option-2', saved.graph.options[1]!.id],
      ]),
    );
    expect(JSON.parse(JSON.stringify(result.referenceMap))).toMatchObject({
      ['__proto__']: optionId,
    });
  });

  it('question의 top-level과 다른 prototype-like clientRef도 own JSON key로 보존한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const command = questionCommand();
    command.input.clientRef = '__proto__';
    command.input.options[0] = {
      ...command.input.options[0]!,
      clientRef: 'constructor',
    };
    command.input.options[1] = {
      ...command.input.options[1]!,
      clientRef: 'toString',
    };
    command.input.correctOptionRef = 'toString';

    const result = await service.createQuestionItem(command);

    expect(
      ['__proto__', 'constructor', 'toString'].every((key) =>
        Object.hasOwn(result.referenceMap, key),
      ),
    ).toBe(true);
    const serialized = JSON.stringify(result.referenceMap);
    expect(serialized).toContain(`"__proto__":"${result.targetId}"`);
    expect(serialized).toContain('"constructor":"');
    expect(serialized).toContain('"toString":"');
  });

  it('문제 item과 option clientRef 충돌로 reference map target을 덮어쓰지 않는다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const command = questionCommand();
    command.input.options[0] = {
      ...command.input.options[0]!,
      clientRef: command.input.clientRef,
    };

    await expect(service.createQuestionItem(command)).rejects.toMatchObject({
      code: 'IMPORT_CONTENT_INVALID',
      path: 'options',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('기존 UUID 참조도 각 종류에서 정확히 하나를 해석한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const sentence = sentenceInput();
    sentence.tokens = sentence.tokens.map((token) => ({
      ...token,
      vocabulary: { id: ids.vocabulary },
      meaning: { id: ids.meaning },
      pronunciation: { id: ids.pronunciation },
    }));
    sentence.expressions = [
      {
        ...sentence.expressions[0]!,
        vocabulary: { id: ids.expression },
      },
    ];
    const command = questionCommand(sentence);
    command.input.options = command.input.options.map((option) => ({
      ...option,
      sentence,
    }));

    await service.createQuestionItem(command);

    expect(
      transaction.findSuccessfulVocabularyImportItemsByReference,
    ).not.toHaveBeenCalled();
    expect(transaction.saveQuestionDraft).toHaveBeenCalledTimes(1);
  });

  it('id와 clientRef를 함께 준 참조는 exact-one 불일치로 거절한다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const sentence = sentenceInput();
    sentence.tokens[0] = {
      ...sentence.tokens[0]!,
      vocabulary: {
        id: ids.vocabulary,
        clientRef: 'word-ref',
      } as never,
    };

    await expect(
      service.createQuestionItem(questionCommand(sentence)),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'blocks.0.sentences.0.sentence.tokens.0.vocabulary',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('같은 clientRef가 성공한 여러 어휘 항목에 있으면 모호한 참조로 거절한다', async () => {
    const ambiguous: ImportedVocabularyReferenceItem = {
      ...importedExpression,
      referenceMap: {
        ...importedExpression.referenceMap,
        'meaning-ref': ids.meaning,
      },
    };
    const transaction = createTransaction({
      importedItems: [importedWord, importedExpression, ambiguous],
    });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_MISMATCH',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('뜻과 발음은 token 어휘의 소유 항목이어야 한다', async () => {
    const transaction = createTransaction({
      meanings: [{ id: ids.meaning, vocabularyId: ids.otherVocabulary }],
    });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'blocks.0.sentences.0.sentence.tokens.0.meaning',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('다른 어휘가 소유한 발음 참조도 mismatch로 거절한다', async () => {
    const transaction = createTransaction({
      pronunciations: [
        {
          id: ids.pronunciation,
          vocabularyId: ids.otherVocabulary,
          mediaAssetId: ids.media,
        },
      ],
    });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'blocks.0.sentences.0.sentence.tokens.0.pronunciation',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('성공한 같은 import에 없는 clientRef는 not found로 거절한다', async () => {
    const transaction = createTransaction({ importedItems: [] });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'blocks.0.sentences.0.sentence.tokens.0.vocabulary',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('표현 범위는 EXPRESSION 어휘만 참조한다', async () => {
    const transaction = createTransaction({
      vocabularies: [
        { id: ids.vocabulary, kind: 'WORD', status: 'DRAFT' },
        { id: ids.expression, kind: 'WORD', status: 'DRAFT' },
      ],
    });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'blocks.0.sentences.0.sentence.expressions.0.vocabulary',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('Thai validator가 찾은 offset 오류를 stable content 오류로 바꾼다', async () => {
    const transaction = createTransaction();
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );
    const sentence = sentenceInput();
    sentence.tokens[0] = {
      ...sentence.tokens[0]!,
      surface: 'ข',
    };

    await expect(
      service.createQuestionItem(questionCommand(sentence)),
    ).rejects.toMatchObject({
      code: 'IMPORT_CONTENT_INVALID',
      path: 'blocks.0.sentences.0.sentence.tokens.0.surface',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('sentence media가 READY가 아니면 stable media 오류로 거절한다', async () => {
    const transaction = createTransaction({
      mediaAssets: [readyMedia(ids.media, 'UPLOADING')],
    });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_MEDIA_NOT_READY',
      path: 'blocks.0.sentences.0.sentence.mediaAssetId',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('sentence media가 없으면 stable reference 오류로 거절한다', async () => {
    const transaction = createTransaction({ mediaAssets: [] });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'blocks.0.sentences.0.sentence.mediaAssetId',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });

  it('등록되지 않은 question type slug와 version을 stable 오류로 거절한다', async () => {
    const transaction = createTransaction({ questionTypeExists: false });
    const service = new ContentDraftService(
      createRepository(transaction),
      createIdGenerator(),
    );

    await expect(
      service.createQuestionItem(questionCommand()),
    ).rejects.toMatchObject({
      code: 'IMPORT_QUESTION_TYPE_NOT_FOUND',
      path: 'questionTypeSlug',
    });
    expect(transaction.saveQuestionDraft).not.toHaveBeenCalled();
  });
});

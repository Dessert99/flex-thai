/** 관리자 문제 초안의 복제·전체 교체와 transaction 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  QuestionAdminRepository,
  QuestionAdminTransaction,
  QuestionAdminVersionGraph,
  QuestionAdminVersionSource,
} from './question-admin.repository.js';
import {
  QuestionAdminError,
  QuestionAdminService,
  type ReplaceQuestionVersionCommand,
} from './question-admin.js';

const occurredAt = new Date('2026-07-24T00:00:00.000Z');
const generatedIds = Array.from(
  { length: 80 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);

const sourceVersion = (
  overrides: Partial<QuestionAdminVersionSource> = {},
): QuestionAdminVersionSource => ({
  id: '00000000-0000-4000-8000-000000000101',
  questionId: '00000000-0000-4000-8000-000000000100',
  version: 1,
  typeVersionId: '00000000-0000-4000-8000-000000000102',
  difficulty: 2,
  status: 'PUBLISHED',
  validationStatus: 'PASSED',
  publishedAt: occurredAt,
  blocks: [
    {
      kind: 'QUESTION',
      displayMode: 'TEXT',
      position: 0,
      sentences: [
        {
          sentenceVersionId: '00000000-0000-4000-8000-000000000103',
          position: 0,
          speaker: null,
        },
      ],
    },
  ],
  options: [
    {
      sentenceVersionId: '00000000-0000-4000-8000-000000000104',
      position: 0,
      isCorrect: true,
    },
  ],
  ...overrides,
});

interface TransactionOverrides {
  question?: Awaited<ReturnType<QuestionAdminTransaction['loadQuestion']>>;
  latestVersion?: QuestionAdminVersionSource | null;
  versionById?: Record<string, QuestionAdminVersionSource | null>;
  mediaReady?: boolean;
  onCreate?: (graph: QuestionAdminVersionGraph) => void;
  onReplace?: (graph: QuestionAdminVersionGraph) => void;
  onAudit?: (
    input: Parameters<QuestionAdminTransaction['appendAuditLog']>[0],
  ) => void;
}

const createTransaction = (
  calls: string[],
  overrides: TransactionOverrides = {},
): QuestionAdminTransaction => ({
  loadQuestion: () => {
    calls.push('loadQuestion');
    return Promise.resolve(
      overrides.question === undefined
        ? {
            id: '00000000-0000-4000-8000-000000000100',
            status: 'PUBLISHED',
            currentPublishedVersionId: '00000000-0000-4000-8000-000000000101',
          }
        : overrides.question,
    );
  },
  loadLatestVersion: () => {
    calls.push('loadLatestVersion');
    return Promise.resolve(overrides.latestVersion ?? sourceVersion());
  },
  loadVersionSource: (versionId) => {
    calls.push(`loadVersionSource:${versionId}`);
    return Promise.resolve(
      overrides.versionById?.[versionId] ??
        sourceVersion({
          id: versionId,
          status: versionId.endsWith('105') ? 'DRAFT' : 'PUBLISHED',
          validationStatus: versionId.endsWith('105') ? 'FAILED' : 'PASSED',
          publishedAt: versionId.endsWith('105') ? null : occurredAt,
        }),
    );
  },
  findQuestionTypeVersion: () => {
    calls.push('findQuestionTypeVersion');
    return Promise.resolve({
      id: '00000000-0000-4000-8000-000000000102',
      slug: 'reading-standard',
      version: 1,
      template: 'STANDARD_CHOICE',
      optionCount: 1,
    });
  },
  findMediaAssetById: (mediaAssetId) => {
    calls.push('findMediaAssetById');
    const base = {
      id: mediaAssetId,
      kind: 'AUDIO' as const,
      storageKey: `audio/${mediaAssetId}`,
      declaredMimeType: 'audio/mpeg',
      declaredSizeBytes: 1,
      declaredSha256: 'a'.repeat(64),
    };
    return Promise.resolve(
      overrides.mediaReady === false
        ? {
            ...base,
            mimeType: null,
            sizeBytes: null,
            sha256: null,
            status: 'UPLOADING' as const,
            readyAt: null,
          }
        : {
            ...base,
            mimeType: 'audio/mpeg',
            sizeBytes: 1,
            sha256: 'a'.repeat(64),
            status: 'READY' as const,
            readyAt: occurredAt,
          },
    );
  },
  findVocabularyById: (id) => {
    calls.push('findVocabularyById');
    return Promise.resolve({ id, kind: 'WORD', status: 'DRAFT' });
  },
  findVocabularyMeaningById: (id) => {
    calls.push('findVocabularyMeaningById');
    return Promise.resolve({
      id,
      vocabularyId: '00000000-0000-4000-8000-000000000108',
    });
  },
  findVocabularyPronunciationById: (id) => {
    calls.push('findVocabularyPronunciationById');
    return Promise.resolve({
      id,
      vocabularyId: '00000000-0000-4000-8000-000000000108',
      mediaAssetId: '00000000-0000-4000-8000-000000000110',
    });
  },
  createVersion: (graph) => {
    calls.push('createVersion');
    overrides.onCreate?.(graph);
    return Promise.resolve();
  },
  replaceVersion: (graph) => {
    calls.push('replaceVersion');
    overrides.onReplace?.(graph);
    return Promise.resolve();
  },
  appendAuditLog: (input) => {
    calls.push('appendAuditLog');
    overrides.onAudit?.(input);
    return Promise.resolve();
  },
});

const createService = (
  transaction: QuestionAdminTransaction,
  calls: string[],
) => {
  const repository: QuestionAdminRepository = {
    runInTransaction: async (work) => {
      const result = await work(transaction);
      calls.push('transactionCommitted');
      return result;
    },
  };
  let index = 0;
  return new QuestionAdminService(repository, () => generatedIds[index++]!);
};

const commandContext = {
  actorUserId: '00000000-0000-4000-8000-000000000120',
  requestId: 'request-id',
  occurredAt,
};

const replaceCommand = (): ReplaceQuestionVersionCommand => ({
  versionId: '00000000-0000-4000-8000-000000000105',
  ...commandContext,
  input: {
    questionTypeSlug: 'reading-standard',
    questionTypeVersion: 1,
    difficulty: 3,
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        sentences: [
          {
            speaker: null,
            sentence: {
              originalText: 'ก',
              translationKo: '뜻',
              pronunciationKo: '꺼',
              toneMarks: '-',
              mediaAssetId: '00000000-0000-4000-8000-000000000107',
              tokens: [
                {
                  surface: 'ก',
                  startOffset: 0,
                  endOffset: 1,
                  vocabulary: {
                    id: '00000000-0000-4000-8000-000000000108',
                  },
                  meaning: {
                    id: '00000000-0000-4000-8000-000000000109',
                  },
                  pronunciation: {
                    id: '00000000-0000-4000-8000-000000000110',
                  },
                  contextMeaningKo: '뜻',
                  role: 'TARGET',
                },
              ],
              expressions: [],
            },
          },
        ],
      },
    ],
    options: [
      {
        clientRef: 'correct',
        position: 0,
        sentence: {
          originalText: 'ข',
          translationKo: '정답',
          pronunciationKo: '커',
          toneMarks: '-',
          mediaAssetId: '00000000-0000-4000-8000-000000000107',
          tokens: [],
          expressions: [],
        },
      },
    ],
    correctOptionRef: 'correct',
  },
});

describe('QuestionAdminService 문제 버전 복제', () => {
  it('현재 게시 버전 내용을 재사용하고 max version 다음 DRAFT를 만든다', async () => {
    const calls: string[] = [];
    let created: QuestionAdminVersionGraph | undefined;
    const latest = sourceVersion({
      id: '00000000-0000-4000-8000-000000000106',
      version: 3,
      status: 'DRAFT',
      validationStatus: 'PENDING',
      publishedAt: null,
    });
    const service = createService(
      createTransaction(calls, {
        latestVersion: latest,
        onCreate: (graph) => {
          created = graph;
        },
      }),
      calls,
    );

    const result = await service.cloneVersion({
      questionId: '00000000-0000-4000-8000-000000000100',
      ...commandContext,
    });

    expect(result).toEqual({
      questionId: '00000000-0000-4000-8000-000000000100',
      versionId: generatedIds[0],
      version: 4,
      status: 'DRAFT',
      validationStatus: 'PENDING',
    });
    expect(created).toMatchObject({
      version: {
        id: generatedIds[0],
        version: 4,
        typeVersionId: '00000000-0000-4000-8000-000000000102',
        status: 'DRAFT',
        validationStatus: 'PENDING',
        validationIssues: [],
        validatedAt: null,
        publishedAt: null,
      },
      sentences: [],
      blocks: [
        {
          sentences: [
            {
              sentenceVersionId: '00000000-0000-4000-8000-000000000103',
            },
          ],
        },
      ],
      options: [
        {
          sentenceVersionId: '00000000-0000-4000-8000-000000000104',
          isCorrect: true,
        },
      ],
    });
    expect(calls).toEqual([
      'loadQuestion',
      'loadLatestVersion',
      'loadVersionSource:00000000-0000-4000-8000-000000000101',
      'createVersion',
      'appendAuditLog',
      'transactionCommitted',
    ]);
  });

  it('현재 게시 버전이 없으면 latest version을 복제 원본으로 사용한다', async () => {
    const calls: string[] = [];
    const latest = sourceVersion({
      id: '00000000-0000-4000-8000-000000000105',
      version: 2,
      status: 'DRAFT',
      validationStatus: 'FAILED',
      publishedAt: null,
    });
    const service = createService(
      createTransaction(calls, {
        question: {
          id: '00000000-0000-4000-8000-000000000100',
          status: 'DRAFT',
          currentPublishedVersionId: null,
        },
        latestVersion: latest,
      }),
      calls,
    );

    await service.cloneVersion({
      questionId: '00000000-0000-4000-8000-000000000100',
      ...commandContext,
    });

    expect(calls).toEqual([
      'loadQuestion',
      'loadLatestVersion',
      'createVersion',
      'appendAuditLog',
      'transactionCommitted',
    ]);
  });

  it('복제 audit 실패는 transaction 성공으로 처리하지 않는다', async () => {
    const calls: string[] = [];
    const transaction = createTransaction(calls);
    transaction.appendAuditLog = () => Promise.reject(new Error('audit-fail'));
    const service = createService(transaction, calls);

    await expect(
      service.cloneVersion({
        questionId: '00000000-0000-4000-8000-000000000100',
        ...commandContext,
      }),
    ).rejects.toThrow('audit-fail');
    expect(calls).not.toContain('transactionCommitted');
  });
});

describe('QuestionAdminService 문제 버전 전체 교체', () => {
  it('DRAFT의 canonical payload를 새 sentence graph로 교체하고 검증을 초기화한다', async () => {
    const calls: string[] = [];
    let replaced: QuestionAdminVersionGraph | undefined;
    const service = createService(
      createTransaction(calls, {
        onReplace: (graph) => {
          replaced = graph;
        },
      }),
      calls,
    );

    const result = await service.replaceVersion(replaceCommand());

    expect(result).toEqual({
      questionId: '00000000-0000-4000-8000-000000000100',
      versionId: '00000000-0000-4000-8000-000000000105',
      version: 1,
      status: 'DRAFT',
      validationStatus: 'PENDING',
    });
    expect(replaced).toMatchObject({
      version: {
        id: '00000000-0000-4000-8000-000000000105',
        questionId: '00000000-0000-4000-8000-000000000100',
        version: 1,
        difficulty: 3,
        status: 'DRAFT',
        validationStatus: 'PENDING',
        validationIssues: [],
        validatedAt: null,
        publishedAt: null,
      },
      sentences: [
        {
          version: {
            version: 1,
            originalText: 'ก',
            frozenAt: null,
          },
          tokens: [
            {
              position: 0,
              vocabularyId: '00000000-0000-4000-8000-000000000108',
              meaningId: '00000000-0000-4000-8000-000000000109',
              pronunciationId: '00000000-0000-4000-8000-000000000110',
            },
          ],
        },
        {
          version: {
            version: 1,
            originalText: 'ข',
            frozenAt: null,
          },
        },
      ],
      blocks: [{ position: 0 }],
      options: [{ position: 0, isCorrect: true }],
    });
    expect(calls).toEqual([
      'loadVersionSource:00000000-0000-4000-8000-000000000105',
      'findQuestionTypeVersion',
      'findMediaAssetById',
      'findVocabularyById',
      'findVocabularyMeaningById',
      'findVocabularyPronunciationById',
      'findMediaAssetById',
      'replaceVersion',
      'appendAuditLog',
      'transactionCommitted',
    ]);
  });

  it('공개 계약이 허용하는 공백 slug와 빈 toneMarks를 그대로 허용한다', async () => {
    const calls: string[] = [];
    const command = replaceCommand();
    command.input.questionTypeSlug = ' ';
    command.input.blocks[0]!.sentences[0]!.sentence.toneMarks = '';
    command.input.options[0]!.sentence.toneMarks = '';
    const service = createService(createTransaction(calls), calls);

    await expect(service.replaceVersion(command)).resolves.toMatchObject({
      status: 'DRAFT',
      validationStatus: 'PENDING',
    });
  });

  it.each(['PUBLISHED', 'RETIRED', 'INVALIDATED'] as const)(
    '%s 버전은 IMMUTABLE_VERSION으로 교체를 거절한다',
    async (status) => {
      const calls: string[] = [];
      const version = sourceVersion({ status });
      const service = createService(
        createTransaction(calls, {
          versionById: {
            '00000000-0000-4000-8000-000000000105': version,
          },
        }),
        calls,
      );

      await expect(service.replaceVersion(replaceCommand())).rejects.toEqual(
        new QuestionAdminError('IMMUTABLE_VERSION'),
      );
      expect(calls).toEqual([
        'loadVersionSource:00000000-0000-4000-8000-000000000105',
      ]);
    },
  );

  it('다른 어휘의 meaning 참조는 저장 전에 거절한다', async () => {
    const calls: string[] = [];
    const transaction = createTransaction(calls);
    transaction.findVocabularyMeaningById = (id) =>
      Promise.resolve({
        id,
        vocabularyId: '00000000-0000-4000-8000-000000000199',
      });
    const service = createService(transaction, calls);

    await expect(
      service.replaceVersion(replaceCommand()),
    ).rejects.toMatchObject({
      code: 'QUESTION_REFERENCE_MISMATCH',
      path: 'blocks.0.sentences.0.sentence.tokens.0.meaning',
    });
    expect(calls).not.toContain('replaceVersion');
  });

  it('READY가 아닌 sentence media는 저장 전에 거절한다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, { mediaReady: false }),
      calls,
    );

    await expect(
      service.replaceVersion(replaceCommand()),
    ).rejects.toMatchObject({
      code: 'QUESTION_MEDIA_NOT_READY',
      path: 'blocks.0.sentences.0.sentence.mediaAssetId',
    });
    expect(calls).not.toContain('replaceVersion');
  });

  it('clientRef 콘텐츠 참조는 import 문맥으로 추측하지 않고 거절한다', async () => {
    const calls: string[] = [];
    const command = replaceCommand();
    command.input.blocks[0]!.sentences[0]!.sentence.tokens[0]!.vocabulary = {
      clientRef: 'word-ref',
    };
    const service = createService(createTransaction(calls), calls);

    await expect(service.replaceVersion(command)).rejects.toMatchObject({
      code: 'QUESTION_REFERENCE_NOT_FOUND',
      path: 'blocks.0.sentences.0.sentence.tokens.0.vocabulary',
    });
    expect(calls).toEqual([]);
  });

  it.each([
    {
      name: 'blocks가 배열이 아님',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        (command.input as unknown as { blocks: unknown }).blocks = {};
      },
    },
    {
      name: '문장 originalText가 빈 문자열',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        command.input.blocks[0]!.sentences[0]!.sentence.originalText = '';
      },
    },
    {
      name: 'block kind가 허용 enum 밖',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        (
          command.input.blocks[0] as unknown as {
            kind: unknown;
          }
        ).kind = 'UNKNOWN';
      },
    },
    {
      name: 'token role이 허용 enum 밖',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        (
          command.input.blocks[0]!.sentences[0]!.sentence
            .tokens[0] as unknown as { role: unknown }
        ).role = 'UNKNOWN';
      },
    },
    {
      name: 'sentence media ID가 UUID가 아님',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        command.input.blocks[0]!.sentences[0]!.sentence.mediaAssetId =
          'not-a-uuid';
      },
    },
    {
      name: '직접 vocabulary ref ID가 UUID가 아님',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        command.input.blocks[0]!.sentences[0]!.sentence.tokens[0]!.vocabulary =
          { id: 'not-a-uuid' };
      },
    },
    {
      name: 'block speaker가 빈 문자열',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        command.input.blocks[0]!.sentences[0]!.speaker = '';
      },
    },
    {
      name: 'expression representative가 boolean이 아님',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        const sentence = command.input.blocks[0]!.sentences[0]!.sentence;
        sentence.expressions = [
          {
            startTokenIndex: 0,
            endTokenIndex: 2,
            vocabulary: {
              id: '00000000-0000-4000-8000-000000000108',
            },
            representative: 'yes',
          } as unknown as (typeof sentence.expressions)[number],
        ];
      },
    },
    {
      name: 'option clientRef가 빈 문자열',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        command.input.options[0]!.clientRef = '';
      },
    },
    {
      name: 'strict payload에 알 수 없는 key가 있음',
      mutate: (command: ReplaceQuestionVersionCommand) => {
        (command.input as unknown as Record<string, unknown>).unknownField =
          true;
      },
    },
  ])('타입을 우회한 $name 입력은 DB 호출 전에 거절한다', async ({ mutate }) => {
    const calls: string[] = [];
    const command = replaceCommand();
    mutate(command);
    const service = createService(createTransaction(calls), calls);

    await expect(service.replaceVersion(command)).rejects.toMatchObject({
      code: 'QUESTION_CONTENT_INVALID',
    });
    expect(calls).toEqual([]);
  });

  it('교체 audit 실패는 transaction 성공으로 처리하지 않는다', async () => {
    const calls: string[] = [];
    const transaction = createTransaction(calls);
    transaction.appendAuditLog = () => Promise.reject(new Error('audit-fail'));
    const service = createService(transaction, calls);

    await expect(service.replaceVersion(replaceCommand())).rejects.toThrow(
      'audit-fail',
    );
    expect(calls).not.toContain('transactionCommitted');
  });
});

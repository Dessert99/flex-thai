/** 문제 게시의 원자적 상태 전이와 최신 콘텐츠 재검증을 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  QuestionPublicationRepository,
  QuestionPublicationTransaction,
  QuestionRecord,
  QuestionVersionRecord,
} from './question-publication.repository.js';
import {
  QuestionPublicationService,
  type QuestionPublicationErrorCode,
} from './question-publication.js';
import type { QuestionVersionValidationCandidate } from './question-version.js';

const occurredAt = new Date('2026-07-24T00:00:00.000Z');

const question = (overrides: Partial<QuestionRecord> = {}): QuestionRecord => ({
  id: 'question-id',
  status: 'DRAFT',
  currentPublishedVersionId: 'published-version-id',
  ...overrides,
});

const version = (
  overrides: Partial<QuestionVersionRecord> = {},
): QuestionVersionRecord => ({
  id: 'draft-version-id',
  questionId: 'question-id',
  version: 2,
  status: 'DRAFT',
  validationStatus: 'PENDING',
  publishedAt: null,
  ...overrides,
});

const candidate = (): QuestionVersionValidationCandidate => ({
  id: 'draft-version-id',
  questionId: 'question-id',
  difficulty: 3,
  typeVersion: {
    id: 'type-version-id',
    template: 'STANDARD_CHOICE',
    optionCount: 2,
  },
  blocks: [
    {
      id: 'question-block',
      kind: 'QUESTION',
      displayMode: 'TEXT',
      position: 0,
      sentences: [],
    },
  ],
  options: [
    {
      id: 'option-1',
      position: 0,
      isCorrect: true,
      sentence: {
        id: 'sentence-1',
        input: {
          originalText: 'กข',
          translationKo: '정답',
          pronunciationKo: '꼬 커',
          toneMarks: '- -',
          mediaAssetId: 'audio-1',
          tokens: [],
          expressions: [],
        },
        mediaAsset: readyAudio('audio-1'),
        referencedVocabularies: [],
        pronunciationMediaAssets: [],
      },
    },
    {
      id: 'option-2',
      position: 1,
      isCorrect: false,
      sentence: {
        id: 'sentence-2',
        input: {
          originalText: 'คง',
          translationKo: '오답',
          pronunciationKo: '커 응어',
          toneMarks: '- -',
          mediaAssetId: 'audio-2',
          tokens: [],
          expressions: [],
        },
        mediaAsset: readyAudio('audio-2'),
        referencedVocabularies: [],
        pronunciationMediaAssets: [],
      },
    },
  ],
});

const readyAudio = (id: string) => ({
  id,
  kind: 'AUDIO' as const,
  storageKey: `audio/${id}`,
  declaredMimeType: 'audio/mpeg',
  declaredSizeBytes: 1,
  declaredSha256: 'a'.repeat(64),
  mimeType: 'audio/mpeg',
  sizeBytes: 1,
  sha256: 'a'.repeat(64),
  status: 'READY' as const,
  readyAt: occurredAt,
});

const createTransaction = (
  calls: string[],
  overrides: {
    question?: QuestionRecord | null;
    version?: QuestionVersionRecord | null;
    candidate?: QuestionVersionValidationCandidate | null;
  } = {},
): QuestionPublicationTransaction => ({
  loadQuestion: async () => {
    calls.push('loadQuestion');
    return overrides.question === undefined ? question() : overrides.question;
  },
  loadVersion: async () => {
    calls.push('loadVersion');
    return overrides.version === undefined ? version() : overrides.version;
  },
  loadValidationCandidate: async () => {
    calls.push('loadValidationCandidate');
    return overrides.candidate === undefined
      ? candidate()
      : overrides.candidate;
  },
  saveValidation: async () => {
    calls.push('saveValidation');
  },
  retireVersion: async () => {
    calls.push('retireVersion');
  },
  publishVersion: async () => {
    calls.push('publishVersion');
  },
  setCurrentPublishedVersion: async () => {
    calls.push('setCurrentPublishedVersion');
  },
  freezeReferencedSentences: async () => {
    calls.push('freezeReferencedSentences');
  },
  invalidateVersion: async () => {
    calls.push('invalidateVersion');
  },
  hideQuestion: async () => {
    calls.push('hideQuestion');
  },
  restoreQuestion: async () => {
    calls.push('restoreQuestion');
  },
  appendAuditLog: async () => {
    calls.push('appendAuditLog');
  },
});

const createRepository = (
  transaction: QuestionPublicationTransaction,
): QuestionPublicationRepository => ({
  runInTransaction: async (work) => work(transaction),
});

const createService = (transaction: QuestionPublicationTransaction) =>
  new QuestionPublicationService(createRepository(transaction));

const publishCommand = {
  questionId: 'question-id',
  versionId: 'draft-version-id',
  actorUserId: 'admin-id',
  requestId: 'request-id',
  occurredAt,
};

const invalidateCommand = {
  ...publishCommand,
  versionId: 'published-version-id',
};

const restoreCommand = {
  questionId: 'question-id',
  actorUserId: 'admin-id',
  requestId: 'request-id',
  occurredAt,
};

const expectPublicationError = (code: QuestionPublicationErrorCode) =>
  expect.objectContaining({ code });

describe('QuestionPublicationService 문제 게시 수명', () => {
  it('게시 transaction에서 최신 상태를 재검증하고 이전 버전을 퇴역시킨다', async () => {
    const calls: string[] = [];
    const service = createService(createTransaction(calls));

    await service.publishVersion(publishCommand);

    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'loadValidationCandidate',
      'saveValidation',
      'retireVersion',
      'publishVersion',
      'setCurrentPublishedVersion',
      'freezeReferencedSentences',
      'appendAuditLog',
    ]);
  });

  it('최신 콘텐츠 재검증이 실패하면 어떤 상태 변경도 호출하지 않는다', async () => {
    const calls: string[] = [];
    const invalidCandidate = candidate();
    invalidCandidate.difficulty = 6;
    const service = createService(
      createTransaction(calls, { candidate: invalidCandidate }),
    );

    await expect(service.publishVersion(publishCommand)).rejects.toEqual(
      expectPublicationError('QUESTION_VERSION_NOT_PUBLISHABLE'),
    );
    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'loadValidationCandidate',
      'saveValidation',
    ]);
  });

  it('현재 게시 버전 무효화와 문제 숨김을 같은 transaction에 둔다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        question: question({ status: 'PUBLISHED' }),
        version: version({
          id: 'published-version-id',
          status: 'PUBLISHED',
          publishedAt: occurredAt,
        }),
      }),
    );

    await service.invalidateVersion(invalidateCommand);

    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'invalidateVersion',
      'hideQuestion',
      'appendAuditLog',
    ]);
  });

  it('유효한 현재 게시 버전이 없는 숨긴 문제는 복구하지 않는다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        question: question({
          status: 'HIDDEN',
          currentPublishedVersionId: 'published-version-id',
        }),
        version: version({
          id: 'published-version-id',
          status: 'INVALIDATED',
          publishedAt: occurredAt,
        }),
      }),
    );

    await expect(service.restoreQuestion(restoreCommand)).rejects.toEqual(
      expectPublicationError('QUESTION_RESTORE_NOT_ALLOWED'),
    );
    expect(calls).toEqual(['loadQuestion', 'loadVersion']);
  });

  it('게시 중인 문제가 아니면 숨기지 않는다', async () => {
    const hideCalls: string[] = [];
    const hideService = createService(
      createTransaction(hideCalls, { question: question({ status: 'DRAFT' }) }),
    );

    await expect(hideService.hideQuestion(restoreCommand)).rejects.toEqual(
      expectPublicationError('QUESTION_STATE_CONFLICT'),
    );
    expect(hideCalls).toEqual(['loadQuestion']);
  });

  it('현재 게시 버전이 유효한 숨긴 문제를 복구한다', async () => {
    const restoreCalls: string[] = [];
    const restoreService = createService(
      createTransaction(restoreCalls, {
        question: question({ status: 'HIDDEN' }),
        version: version({
          id: 'published-version-id',
          status: 'PUBLISHED',
          publishedAt: occurredAt,
        }),
      }),
    );

    await restoreService.restoreQuestion(restoreCommand);

    expect(restoreCalls).toEqual([
      'loadQuestion',
      'loadVersion',
      'restoreQuestion',
      'appendAuditLog',
    ]);
  });

  it('존재하지 않는 문제는 QUESTION_NOT_FOUND로 거절한다', async () => {
    const service = createService(createTransaction([], { question: null }));

    await expect(service.publishVersion(publishCommand)).rejects.toEqual(
      expectPublicationError('QUESTION_NOT_FOUND'),
    );
  });

  it('존재하지 않는 문제 버전은 QUESTION_VERSION_NOT_FOUND로 거절한다', async () => {
    const service = createService(createTransaction([], { version: null }));

    await expect(service.publishVersion(publishCommand)).rejects.toEqual(
      expectPublicationError('QUESTION_VERSION_NOT_FOUND'),
    );
  });

  it('다른 문제 소유 버전은 QUESTION_VERSION_MISMATCH로 거절한다', async () => {
    const service = createService(
      createTransaction([], {
        version: version({ questionId: 'other-question-id' }),
      }),
    );

    await expect(service.publishVersion(publishCommand)).rejects.toEqual(
      expectPublicationError('QUESTION_VERSION_MISMATCH'),
    );
  });

  it('초안이 아닌 버전은 IMMUTABLE_VERSION으로 게시하지 않는다', async () => {
    const service = createService(
      createTransaction([], {
        version: version({ status: 'PUBLISHED', publishedAt: occurredAt }),
      }),
    );

    await expect(service.publishVersion(publishCommand)).rejects.toEqual(
      expectPublicationError('IMMUTABLE_VERSION'),
    );
  });
});

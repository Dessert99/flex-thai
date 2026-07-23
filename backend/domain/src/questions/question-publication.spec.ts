/** 문제 게시의 원자적 상태 전이와 최신 콘텐츠 재검증을 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  QuestionPublicationRepository,
  QuestionPublicationTransaction,
  QuestionRecord,
  QuestionVersionRecord,
} from './question-publication.repository.js';
import {
  type QuestionPublicationError,
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

interface TransactionOverrides {
  question?: QuestionRecord | null;
  version?: QuestionVersionRecord | null;
  versions?: Record<string, QuestionVersionRecord | null>;
  candidate?: QuestionVersionValidationCandidate | null;
  onRetireVersion?: (versionId: string, questionId: string) => void;
}

const createTransaction = (
  calls: string[],
  overrides: TransactionOverrides = {},
): QuestionPublicationTransaction => ({
  loadQuestion: () => {
    calls.push('loadQuestion');
    return Promise.resolve(
      overrides.question === undefined ? question() : overrides.question,
    );
  },
  loadVersion: (versionId) => {
    calls.push('loadVersion');
    if (overrides.versions && versionId in overrides.versions) {
      return Promise.resolve(overrides.versions[versionId]!);
    }
    return Promise.resolve(
      overrides.version === undefined ? version() : overrides.version,
    );
  },
  loadValidationCandidate: () => {
    calls.push('loadValidationCandidate');
    return Promise.resolve(
      overrides.candidate === undefined ? candidate() : overrides.candidate,
    );
  },
  saveValidation: () => {
    calls.push('saveValidation');
    return Promise.resolve();
  },
  retireVersion: (versionId, questionId) => {
    calls.push('retireVersion');
    overrides.onRetireVersion?.(versionId, questionId);
    return Promise.resolve();
  },
  publishVersion: () => {
    calls.push('publishVersion');
    return Promise.resolve();
  },
  setCurrentPublishedVersion: () => {
    calls.push('setCurrentPublishedVersion');
    return Promise.resolve();
  },
  freezeReferencedSentences: () => {
    calls.push('freezeReferencedSentences');
    return Promise.resolve();
  },
  invalidateVersion: () => {
    calls.push('invalidateVersion');
    return Promise.resolve();
  },
  hideQuestion: () => {
    calls.push('hideQuestion');
    return Promise.resolve();
  },
  restoreQuestion: () => {
    calls.push('restoreQuestion');
    return Promise.resolve();
  },
  appendAuditLog: () => {
    calls.push('appendAuditLog');
    return Promise.resolve();
  },
});

const createRepository = (
  transaction: QuestionPublicationTransaction,
  calls: string[],
): QuestionPublicationRepository => ({
  runInTransaction: async (work) => {
    const result = await work(transaction);
    calls.push('transactionCommitted');
    return result;
  },
});

const createService = (
  transaction: QuestionPublicationTransaction,
  calls: string[],
) => new QuestionPublicationService(createRepository(transaction, calls));

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

const expectedPublicationError = (
  code: QuestionPublicationErrorCode,
): Pick<QuestionPublicationError, 'code'> => ({ code });

describe('QuestionPublicationService 문제 게시 수명', () => {
  it('게시 transaction에서 최신 상태를 재검증하고 이전 버전을 퇴역시킨다', async () => {
    const calls: string[] = [];
    const retired: Array<[string, string]> = [];
    const service = createService(
      createTransaction(calls, {
        versions: {
          'published-version-id': version({
            id: 'published-version-id',
            status: 'PUBLISHED',
            publishedAt: occurredAt,
          }),
        },
        onRetireVersion: (versionId, questionId) => {
          retired.push([versionId, questionId]);
        },
      }),
      calls,
    );

    await service.publishVersion(publishCommand);

    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'loadValidationCandidate',
      'saveValidation',
      'loadVersion',
      'retireVersion',
      'publishVersion',
      'setCurrentPublishedVersion',
      'freezeReferencedSentences',
      'appendAuditLog',
      'transactionCommitted',
    ]);
    expect(retired).toEqual([['published-version-id', 'question-id']]);
  });

  it.each([
    {
      name: '존재하지 않는 이전 현재 버전',
      currentVersion: null,
      code: 'QUESTION_VERSION_NOT_FOUND' as const,
    },
    {
      name: '다른 문제 소유 이전 현재 버전',
      currentVersion: version({
        id: 'published-version-id',
        questionId: 'other-question-id',
        status: 'PUBLISHED',
        publishedAt: occurredAt,
      }),
      code: 'QUESTION_VERSION_MISMATCH' as const,
    },
    {
      name: '게시 상태가 아닌 이전 현재 버전',
      currentVersion: version({
        id: 'published-version-id',
        status: 'RETIRED',
        publishedAt: occurredAt,
      }),
      code: 'QUESTION_STATE_CONFLICT' as const,
    },
  ])('$name은 퇴역하지 않는다', async ({ currentVersion, code }) => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        versions: { 'published-version-id': currentVersion },
      }),
      calls,
    );

    await expect(service.publishVersion(publishCommand)).rejects.toMatchObject(
      expectedPublicationError(code),
    );
    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'loadValidationCandidate',
      'saveValidation',
      'loadVersion',
    ]);
  });

  it('최신 콘텐츠 재검증 실패 기록을 commit한 뒤 상태 변경 없이 오류를 던진다', async () => {
    const calls: string[] = [];
    const invalidCandidate = candidate();
    invalidCandidate.difficulty = 6;
    const service = createService(
      createTransaction(calls, { candidate: invalidCandidate }),
      calls,
    );

    await expect(service.publishVersion(publishCommand)).rejects.toMatchObject(
      expectedPublicationError('QUESTION_VERSION_NOT_PUBLISHABLE'),
    );
    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'loadValidationCandidate',
      'saveValidation',
      'transactionCommitted',
    ]);
  });

  it('숨긴 문제의 초안 버전은 검증과 저장 없이 게시를 거절한다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        question: question({ status: 'HIDDEN' }),
      }),
      calls,
    );

    await expect(service.publishVersion(publishCommand)).rejects.toMatchObject(
      expectedPublicationError('QUESTION_STATE_CONFLICT'),
    );
    expect(calls).toEqual(['loadQuestion', 'loadVersion']);
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
      calls,
    );

    await service.invalidateVersion(invalidateCommand);

    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'invalidateVersion',
      'hideQuestion',
      'appendAuditLog',
      'transactionCommitted',
    ]);
  });

  it('이미 숨긴 문제는 현재 게시 버전만 무효화하고 숨김 update를 반복하지 않는다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        question: question({ status: 'HIDDEN' }),
        version: version({
          id: 'published-version-id',
          status: 'PUBLISHED',
          publishedAt: occurredAt,
        }),
      }),
      calls,
    );

    await service.invalidateVersion(invalidateCommand);

    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'invalidateVersion',
      'appendAuditLog',
      'transactionCommitted',
    ]);
  });

  it('다른 문제 소유 버전은 현재 게시 버전으로 무효화하지 않는다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        question: question({ status: 'PUBLISHED' }),
        version: version({
          id: 'published-version-id',
          questionId: 'other-question-id',
          status: 'PUBLISHED',
          publishedAt: occurredAt,
        }),
      }),
      calls,
    );

    await expect(
      service.invalidateVersion(invalidateCommand),
    ).rejects.toMatchObject(
      expectedPublicationError('QUESTION_VERSION_MISMATCH'),
    );
    expect(calls).toEqual(['loadQuestion', 'loadVersion']);
  });

  it('현재 포인터와 다른 버전은 무효화하지 않는다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        question: question({
          status: 'PUBLISHED',
          currentPublishedVersionId: 'another-version-id',
        }),
        version: version({
          id: 'published-version-id',
          status: 'PUBLISHED',
          publishedAt: occurredAt,
        }),
      }),
      calls,
    );

    await expect(
      service.invalidateVersion(invalidateCommand),
    ).rejects.toMatchObject(
      expectedPublicationError('QUESTION_STATE_CONFLICT'),
    );
    expect(calls).toEqual(['loadQuestion', 'loadVersion']);
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
      calls,
    );

    await expect(service.restoreQuestion(restoreCommand)).rejects.toMatchObject(
      expectedPublicationError('QUESTION_RESTORE_NOT_ALLOWED'),
    );
    expect(calls).toEqual(['loadQuestion', 'loadVersion']);
  });

  it('게시 중인 문제가 아니면 숨기지 않는다', async () => {
    const hideCalls: string[] = [];
    const hideService = createService(
      createTransaction(hideCalls, { question: question({ status: 'DRAFT' }) }),
      hideCalls,
    );

    await expect(
      hideService.hideQuestion(restoreCommand),
    ).rejects.toMatchObject(
      expectedPublicationError('QUESTION_STATE_CONFLICT'),
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
      restoreCalls,
    );

    await restoreService.restoreQuestion(restoreCommand);

    expect(restoreCalls).toEqual([
      'loadQuestion',
      'loadVersion',
      'restoreQuestion',
      'appendAuditLog',
      'transactionCommitted',
    ]);
  });

  it('다른 문제 소유 현재 버전으로는 숨긴 문제를 복구하지 않는다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, {
        question: question({ status: 'HIDDEN' }),
        version: version({
          id: 'published-version-id',
          questionId: 'other-question-id',
          status: 'PUBLISHED',
          publishedAt: occurredAt,
        }),
      }),
      calls,
    );

    await expect(service.restoreQuestion(restoreCommand)).rejects.toMatchObject(
      expectedPublicationError('QUESTION_VERSION_MISMATCH'),
    );
    expect(calls).toEqual(['loadQuestion', 'loadVersion']);
  });

  it('존재하지 않는 버전은 validateVersion에서 거절한다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, { version: null }),
      calls,
    );

    await expect(
      service.validateVersion('draft-version-id', occurredAt),
    ).rejects.toMatchObject(
      expectedPublicationError('QUESTION_VERSION_NOT_FOUND'),
    );
    expect(calls).toEqual(['loadVersion']);
  });

  it('검증 후보가 없으면 validateVersion에서 거절한다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, { candidate: null }),
      calls,
    );

    await expect(
      service.validateVersion('draft-version-id', occurredAt),
    ).rejects.toMatchObject(
      expectedPublicationError('QUESTION_VERSION_NOT_FOUND'),
    );
    expect(calls).toEqual(['loadVersion', 'loadValidationCandidate']);
  });

  it('존재하지 않는 문제는 QUESTION_NOT_FOUND로 거절한다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, { question: null }),
      calls,
    );

    await expect(service.publishVersion(publishCommand)).rejects.toMatchObject(
      expectedPublicationError('QUESTION_NOT_FOUND'),
    );
  });

  it('존재하지 않는 문제 버전은 QUESTION_VERSION_NOT_FOUND로 거절한다', async () => {
    const calls: string[] = [];
    const service = createService(
      createTransaction(calls, { version: null }),
      calls,
    );

    await expect(service.publishVersion(publishCommand)).rejects.toMatchObject(
      expectedPublicationError('QUESTION_VERSION_NOT_FOUND'),
    );
  });

  it('다른 문제 소유 버전은 QUESTION_VERSION_MISMATCH로 거절한다', async () => {
    const service = createService(
      createTransaction([], {
        version: version({ questionId: 'other-question-id' }),
      }),
      [],
    );

    await expect(service.publishVersion(publishCommand)).rejects.toMatchObject(
      expectedPublicationError('QUESTION_VERSION_MISMATCH'),
    );
  });

  it('초안이 아닌 버전은 IMMUTABLE_VERSION으로 게시하지 않는다', async () => {
    const service = createService(
      createTransaction([], {
        version: version({ status: 'PUBLISHED', publishedAt: occurredAt }),
      }),
      [],
    );

    await expect(service.publishVersion(publishCommand)).rejects.toMatchObject(
      expectedPublicationError('IMMUTABLE_VERSION'),
    );
  });
});

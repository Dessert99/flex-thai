/** 답안 append-only 수명과 clientAttemptId 멱등성을 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  InsertQuestionAttemptInput,
  QuestionAttemptRecord,
  QuestionAttemptRepository,
  QuestionAttemptSubmissionTarget,
  QuestionAttemptTransaction,
} from './question-attempt.repository.js';
import { QuestionAttemptService } from './question-attempt.js';

const userId = 'user-1';
const questionId = 'question-1';
const questionVersionId = 'question-version-1';
const selectedOptionId = 'option-1';
const correctOptionId = 'option-2';
const clientAttemptId = 'client-attempt-1';
const submittedAt = new Date('2026-07-24T00:00:00.000Z');

const createTarget = (
  overrides: Partial<QuestionAttemptSubmissionTarget> = {},
): QuestionAttemptSubmissionTarget => ({
  questionStatus: 'PUBLISHED',
  currentPublishedVersionId: questionVersionId,
  questionVersionStatus: 'PUBLISHED',
  selectedOptionId,
  correctOptionId,
  ...overrides,
});

class FakeQuestionAttemptRepository implements QuestionAttemptRepository {
  readonly calls: string[] = [];
  readonly attempts: QuestionAttemptRecord[] = [];
  target: QuestionAttemptSubmissionTarget | null = createTarget();

  runInTransaction<T>(
    userIdInput: string,
    work: (transaction: QuestionAttemptTransaction) => Promise<T>,
  ): Promise<T> {
    this.calls.push(`runInTransaction:${userIdInput}`);
    return work({
      findByClientAttemptId: (lookupUserId, lookupClientAttemptId) => {
        this.calls.push('findByClientAttemptId');
        return Promise.resolve(
          this.attempts.find(
            (attempt) =>
              attempt.userId === lookupUserId &&
              attempt.clientAttemptId === lookupClientAttemptId,
          ) ?? null,
        );
      },
      loadSubmissionTarget: (
        lookupQuestionId,
        lookupQuestionVersionId,
        lookupSelectedOptionId,
      ) => {
        this.calls.push(
          `loadSubmissionTarget:${lookupQuestionId}:${lookupQuestionVersionId}:${lookupSelectedOptionId}`,
        );
        return Promise.resolve(this.target);
      },
      readNextAttemptNo: (lookupUserId, lookupQuestionId) => {
        this.calls.push('readNextAttemptNo');
        const attemptNos = this.attempts
          .filter(
            (attempt) =>
              attempt.userId === lookupUserId &&
              attempt.questionId === lookupQuestionId,
          )
          .map((attempt) => attempt.attemptNo);
        return Promise.resolve(Math.max(0, ...attemptNos) + 1);
      },
      insertAttempt: (input: InsertQuestionAttemptInput) => {
        this.calls.push('insertAttempt');
        this.attempts.push(input);
        return Promise.resolve();
      },
      loadCorrectOptionId: (lookupQuestionVersionId) => {
        this.calls.push(`loadCorrectOptionId:${lookupQuestionVersionId}`);
        return Promise.resolve(correctOptionId);
      },
    });
  }
}

const createService = (
  repository: FakeQuestionAttemptRepository,
): QuestionAttemptService =>
  new QuestionAttemptService(
    repository,
    () => submittedAt,
    () => `attempt-${repository.attempts.length + 1}`,
  );

const createInput = (
  overrides: Partial<Parameters<QuestionAttemptService['submit']>[0]> = {},
) => ({
  userId,
  questionId,
  questionVersionId,
  selectedOptionId,
  clientAttemptId,
  durationMs: 18_400,
  ...overrides,
});

describe('QuestionAttemptService 답안 제출', () => {
  it('첫 답은 attemptNo 1과 정답 여부를 append-only로 저장한다', async () => {
    const repository = new FakeQuestionAttemptRepository();
    const service = createService(repository);

    const result = await service.submit(createInput());

    expect(result).toEqual({
      attempt: {
        id: 'attempt-1',
        userId,
        questionId,
        questionVersionId,
        attemptNo: 1,
        selectedOptionId,
        clientAttemptId,
        durationMs: 18_400,
        isCorrect: false,
        submittedAt,
      },
      feedback: { correctOptionId },
    });
    expect(repository.attempts).toEqual([result.attempt]);
    expect(repository.calls).toEqual([
      `runInTransaction:${userId}`,
      'findByClientAttemptId',
      `loadSubmissionTarget:${questionId}:${questionVersionId}:${selectedOptionId}`,
      'readNextAttemptNo',
      'insertAttempt',
    ]);
  });

  it('다음 제출은 기존 답을 유지하고 attemptNo를 증가시킨다', async () => {
    const repository = new FakeQuestionAttemptRepository();
    const service = createService(repository);
    const first = await service.submit(createInput());
    repository.target = createTarget({ selectedOptionId: correctOptionId });

    const second = await service.submit(
      createInput({
        selectedOptionId: correctOptionId,
        clientAttemptId: 'client-attempt-2',
      }),
    );

    expect(repository.attempts).toHaveLength(2);
    expect(repository.attempts[0]).toEqual(first.attempt);
    expect(second.attempt).toMatchObject({
      attemptNo: 2,
      isCorrect: true,
      selectedOptionId: correctOptionId,
    });
  });

  it('같은 clientAttemptId와 같은 payload는 기존 답을 반환한다', async () => {
    const repository = new FakeQuestionAttemptRepository();
    const service = createService(repository);
    const first = await service.submit(createInput());
    repository.calls.length = 0;
    repository.target = createTarget({
      questionStatus: 'HIDDEN',
      questionVersionStatus: 'INVALIDATED',
    });

    const replay = await service.submit(createInput());

    expect(replay).toEqual(first);
    expect(repository.attempts).toHaveLength(1);
    expect(repository.calls).toEqual([
      `runInTransaction:${userId}`,
      'findByClientAttemptId',
      `loadCorrectOptionId:${questionVersionId}`,
    ]);
  });

  it('같은 clientAttemptId의 payload가 다르면 충돌한다', async () => {
    const changedPayloads = [
      { questionId: 'question-2' },
      { questionVersionId: 'question-version-2' },
      { selectedOptionId: 'option-3' },
      { durationMs: 18_401 },
    ];

    for (const changedPayload of changedPayloads) {
      const repository = new FakeQuestionAttemptRepository();
      const service = createService(repository);
      await service.submit(createInput());
      repository.calls.length = 0;

      await expect(
        service.submit(createInput(changedPayload)),
      ).rejects.toMatchObject({
        code: 'ATTEMPT_IDEMPOTENCY_CONFLICT',
      });
      expect(repository.attempts).toHaveLength(1);
      expect(repository.calls).toEqual([
        `runInTransaction:${userId}`,
        'findByClientAttemptId',
      ]);
    }
  });

  it('숨김·무효화·current 불일치 문제에는 새 답을 저장하지 않는다', async () => {
    const unavailableTargets: Array<QuestionAttemptSubmissionTarget | null> = [
      null,
      createTarget({ questionStatus: 'HIDDEN' }),
      createTarget({ questionVersionStatus: 'RETIRED' }),
      createTarget({ questionVersionStatus: 'INVALIDATED' }),
      createTarget({ currentPublishedVersionId: 'other-version' }),
    ];

    for (const target of unavailableTargets) {
      const repository = new FakeQuestionAttemptRepository();
      repository.target = target;
      const service = createService(repository);

      await expect(service.submit(createInput())).rejects.toMatchObject({
        code: 'QUESTION_UNAVAILABLE',
      });
      expect(repository.attempts).toHaveLength(0);
    }
  });

  it('다른 version의 선택지는 저장하지 않는다', async () => {
    const repository = new FakeQuestionAttemptRepository();
    repository.target = createTarget({ selectedOptionId: null });
    const service = createService(repository);

    await expect(service.submit(createInput())).rejects.toMatchObject({
      code: 'QUESTION_OPTION_MISMATCH',
    });
    expect(repository.attempts).toHaveLength(0);
  });
});

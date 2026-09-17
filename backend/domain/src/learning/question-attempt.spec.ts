import { describe, expect, it } from 'vitest';
import { QuestionAttemptService } from './question-attempt.js';
import type {
  QuestionAttemptRecord,
  QuestionAttemptRepository,
  QuestionAttemptSubmissionTarget,
} from './question-attempt.repository.js';
const fixture = () => {
  const attempts: QuestionAttemptRecord[] = [];
  let target: QuestionAttemptSubmissionTarget | null = {
    status: 'PUBLISHED',
    snapshot: {
      updatedAt: '2026-09-17T00:00:00Z',
      version: 1,
      typeVersionId: 'type',
      difficulty: 2,
      passage: '본문',
      prompt: '문제',
      options: [
        { id: 'a', text: '가' },
        { id: 'b', text: '나' },
      ],
      correctOptionId: 'a',
      explanation: '첫 해설',
    },
  };
  const repository: QuestionAttemptRepository = {
    runInTransaction: async (_user, work) =>
      work({
        findByClientAttemptId: (_userId, id) =>
          Promise.resolve(
            attempts.find((item) => item.clientAttemptId === id) ?? null,
          ),
        loadSubmissionTarget: () => Promise.resolve(target),
        readNextAttemptNo: () => Promise.resolve(attempts.length + 1),
        insertAttempt: (attempt) => {
          attempts.push(attempt);
          return Promise.resolve();
        },
      }),
  };
  let id = 0;
  return {
    attempts,
    setTarget: (next: QuestionAttemptSubmissionTarget | null) => {
      target = next;
    },
    service: new QuestionAttemptService(
      repository,
      () => new Date(),
      () => `attempt-${++id}`,
    ),
    target: target,
  };
};
const input = {
  userId: 'user',
  questionId: 'question',
  questionVersion: 1,
  selectedOptionId: 'a',
  clientAttemptId: 'client',
  durationMs: 500,
};
describe('풀이 당시 문제 보존', () => {
  it('서버가 채점하고 당시 문제와 해설을 기록한다', async () => {
    const f = fixture();
    const result = await f.service.submit(input);
    expect(result.attempt.isCorrect).toBe(true);
    expect(result.attempt.questionSnapshot.explanation).toBe('첫 해설');
    expect(result.feedback).toEqual({
      correctOptionId: 'a',
      explanation: '첫 해설',
    });
  });
  it('저장 후 현재 문제를 바꿔도 같은 요청의 피드백은 바뀌지 않는다', async () => {
    const f = fixture();
    const first = await f.service.submit(input);
    f.target.snapshot.explanation = '수정 해설';
    f.target.snapshot.correctOptionId = 'b';
    f.target.snapshot.version = 2;
    const replay = await f.service.submit(input);
    expect(replay).toEqual(first);
    expect(replay.feedback.explanation).toBe('첫 해설');
    expect(f.attempts).toHaveLength(1);
  });
  it('문제를 연 뒤 버전이 바뀌면 저장하지 않는다', async () => {
    const f = fixture();
    f.target.snapshot.version = 2;
    await expect(f.service.submit(input)).rejects.toMatchObject({
      code: 'QUESTION_VERSION_CONFLICT',
    });
    expect(f.attempts).toHaveLength(0);
  });
  it('숨김 문제와 다른 문제의 선택지 제출을 거부한다', async () => {
    const f = fixture();
    await expect(
      f.service.submit({ ...input, selectedOptionId: 'unknown' }),
    ).rejects.toMatchObject({ code: 'QUESTION_OPTION_MISMATCH' });
    f.target.status = 'HIDDEN';
    await expect(f.service.submit(input)).rejects.toMatchObject({
      code: 'QUESTION_UNAVAILABLE',
    });
  });
  it('같은 멱등 ID의 다른 답은 거부하고 새 ID의 재풀이는 추가한다', async () => {
    const f = fixture();
    await f.service.submit(input);
    await expect(
      f.service.submit({ ...input, selectedOptionId: 'b' }),
    ).rejects.toMatchObject({ code: 'ATTEMPT_IDEMPOTENCY_CONFLICT' });
    const next = await f.service.submit({
      ...input,
      clientAttemptId: 'new',
      selectedOptionId: 'b',
    });
    expect(next.attempt.attemptNo).toBe(2);
    expect(next.attempt.isCorrect).toBe(false);
    expect(f.attempts).toHaveLength(2);
  });
});

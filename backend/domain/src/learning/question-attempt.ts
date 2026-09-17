/** 원문 snapshot과 채점을 원자 저장하고 수정된 문제의 오래된 답안은 거절한다. */
import { randomUUID } from 'node:crypto';
import type {
  QuestionAttemptRecord,
  QuestionAttemptRepository,
} from './question-attempt.repository.js';
export type LearningDomainErrorCode =
  | 'QUESTION_UNAVAILABLE'
  | 'QUESTION_VERSION_CONFLICT'
  | 'QUESTION_OPTION_MISMATCH'
  | 'ATTEMPT_IDEMPOTENCY_CONFLICT'
  | 'VOCABULARY_UNAVAILABLE';
export class LearningDomainError extends Error {
  constructor(readonly code: LearningDomainErrorCode) {
    super(code);
    this.name = 'LearningDomainError';
  }
}
export interface SubmitQuestionAttemptInput {
  userId: string;
  questionId: string;
  questionVersion: number;
  selectedOptionId: string;
  clientAttemptId: string;
  durationMs: number;
}
export interface SubmitQuestionAttemptResult {
  attempt: QuestionAttemptRecord;
  feedback: { correctOptionId: string; explanation: string };
}
const resultOf = (
  attempt: QuestionAttemptRecord,
): SubmitQuestionAttemptResult => ({
  attempt,
  feedback: {
    correctOptionId: attempt.questionSnapshot.correctOptionId,
    explanation: attempt.questionSnapshot.explanation,
  },
});
export class QuestionAttemptService {
  constructor(
    private readonly repository: QuestionAttemptRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}
  submit(
    input: SubmitQuestionAttemptInput,
  ): Promise<SubmitQuestionAttemptResult> {
    return this.repository.runInTransaction(
      input.userId,
      async (transaction) => {
        const existing = await transaction.findByClientAttemptId(
          input.userId,
          input.clientAttemptId,
        );
        if (existing) {
          if (
            existing.questionId !== input.questionId ||
            existing.questionVersion !== input.questionVersion ||
            existing.selectedOptionId !== input.selectedOptionId ||
            existing.durationMs !== input.durationMs
          ) {
            throw new LearningDomainError('ATTEMPT_IDEMPOTENCY_CONFLICT');
          }
          return resultOf(existing);
        }
        const target = await transaction.loadSubmissionTarget(input.questionId);
        if (!target || target.status !== 'PUBLISHED')
          throw new LearningDomainError('QUESTION_UNAVAILABLE');
        if (target.snapshot.version !== input.questionVersion)
          throw new LearningDomainError('QUESTION_VERSION_CONFLICT');
        if (
          !target.snapshot.options.some(
            (option) => option.id === input.selectedOptionId,
          )
        )
          throw new LearningDomainError('QUESTION_OPTION_MISMATCH');
        const attempt: QuestionAttemptRecord = {
          id: this.createId(),
          ...input,
          questionSnapshot: structuredClone(target.snapshot),
          attemptNo: await transaction.readNextAttemptNo(
            input.userId,
            input.questionId,
          ),
          isCorrect: target.snapshot.correctOptionId === input.selectedOptionId,
          submittedAt: this.now(),
        };
        await transaction.insertAttempt(attempt);
        return resultOf(attempt);
      },
    );
  }
}

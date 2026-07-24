/** 학습자 답안의 가용성·멱등성·append-only 수명을 조정한다 */
import { randomUUID } from 'node:crypto';
import type {
  QuestionAttemptRecord,
  QuestionAttemptRepository,
  QuestionAttemptSubmissionTarget,
} from './question-attempt.repository.js';

/** 학습자 쓰기 흐름이 공개 계층에 전달하는 안정적인 오류 code다 */
export type LearningDomainErrorCode =
  | 'QUESTION_UNAVAILABLE'
  | 'QUESTION_OPTION_MISMATCH'
  | 'ATTEMPT_IDEMPOTENCY_CONFLICT'
  | 'VOCABULARY_UNAVAILABLE';

/** 학습자 쓰기 흐름의 안정적인 공개 오류다 */
export class LearningDomainError extends Error {
  constructor(readonly code: LearningDomainErrorCode) {
    super(code);
    this.name = 'LearningDomainError';
  }
}

/** 새 답안 또는 clientAttemptId 재전송에 필요한 요청 값이다 */
export interface SubmitQuestionAttemptInput {
  userId: string;
  questionId: string;
  questionVersionId: string;
  selectedOptionId: string;
  clientAttemptId: string;
  durationMs: number;
}

/** 저장된 원시 답안과 제출한 버전의 정답 피드백이다 */
export interface SubmitQuestionAttemptResult {
  attempt: QuestionAttemptRecord;
  feedback: {
    correctOptionId: string;
  };
}

const isSamePayload = (
  attempt: QuestionAttemptRecord,
  input: SubmitQuestionAttemptInput,
): boolean =>
  attempt.questionId === input.questionId &&
  attempt.questionVersionId === input.questionVersionId &&
  attempt.selectedOptionId === input.selectedOptionId &&
  attempt.durationMs === input.durationMs;

const assertAvailableTarget = (
  target: QuestionAttemptSubmissionTarget | null,
  input: SubmitQuestionAttemptInput,
): {
  selectedOptionId: string;
  correctOptionId: string;
} => {
  if (
    !target ||
    target.questionStatus !== 'PUBLISHED' ||
    target.currentPublishedVersionId !== input.questionVersionId ||
    target.questionVersionStatus !== 'PUBLISHED'
  ) {
    throw new LearningDomainError('QUESTION_UNAVAILABLE');
  }
  if (target.selectedOptionId !== input.selectedOptionId) {
    throw new LearningDomainError('QUESTION_OPTION_MISMATCH');
  }
  if (!target.correctOptionId) {
    throw new LearningDomainError('QUESTION_UNAVAILABLE');
  }
  return {
    selectedOptionId: target.selectedOptionId,
    correctOptionId: target.correctOptionId,
  };
};

/** 네트워크 재전송과 첫 답·재시도를 원자적으로 저장한다 */
export class QuestionAttemptService {
  constructor(
    private readonly repository: QuestionAttemptRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  /** 재전송은 기존 원시 답을, 새 제출은 다음 attemptNo 답을 반환한다 */
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
          if (!isSamePayload(existing, input)) {
            throw new LearningDomainError('ATTEMPT_IDEMPOTENCY_CONFLICT');
          }
          // 재전송은 현재 노출 상태가 바뀌어도 원래 제출 결과를 복원한다.
          const existingCorrectOptionId = await transaction.loadCorrectOptionId(
            existing.questionVersionId,
          );
          return {
            attempt: existing,
            feedback: { correctOptionId: existingCorrectOptionId },
          };
        }

        const target = assertAvailableTarget(
          await transaction.loadSubmissionTarget(
            input.questionId,
            input.questionVersionId,
            input.selectedOptionId,
          ),
          input,
        );
        const attempt: QuestionAttemptRecord = {
          id: this.createId(),
          userId: input.userId,
          questionId: input.questionId,
          questionVersionId: input.questionVersionId,
          attemptNo: await transaction.readNextAttemptNo(
            input.userId,
            input.questionId,
          ),
          selectedOptionId: target.selectedOptionId,
          clientAttemptId: input.clientAttemptId,
          durationMs: input.durationMs,
          isCorrect: target.selectedOptionId === target.correctOptionId,
          submittedAt: this.now(),
        };
        await transaction.insertAttempt(attempt);
        return {
          attempt,
          feedback: { correctOptionId: target.correctOptionId },
        };
      },
    );
  }
}

/** 사용자별 멱등 제출과 현재 문제 잠금을 같은 transaction으로 처리한다. */
import type { QuestionSnapshot } from '../questions/question.js';
export interface QuestionAttemptRecord {
  id: string;
  userId: string;
  questionId: string;
  questionVersion: number;
  questionSnapshot: QuestionSnapshot;
  attemptNo: number;
  selectedOptionId: string;
  clientAttemptId: string;
  durationMs: number;
  isCorrect: boolean;
  submittedAt: Date;
}
export type InsertQuestionAttemptInput = QuestionAttemptRecord;
export interface QuestionAttemptSubmissionTarget {
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  snapshot: QuestionSnapshot;
}
export interface QuestionAttemptTransaction {
  findByClientAttemptId(
    userId: string,
    clientAttemptId: string,
  ): Promise<QuestionAttemptRecord | null>;
  loadSubmissionTarget(
    questionId: string,
  ): Promise<QuestionAttemptSubmissionTarget | null>;
  readNextAttemptNo(userId: string, questionId: string): Promise<number>;
  insertAttempt(input: InsertQuestionAttemptInput): Promise<void>;
}
export interface QuestionAttemptRepository {
  runInTransaction<T>(
    userId: string,
    work: (transaction: QuestionAttemptTransaction) => Promise<T>,
  ): Promise<T>;
}

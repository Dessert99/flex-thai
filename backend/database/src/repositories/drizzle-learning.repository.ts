/** 학습 답안 transaction과 저장 문제 연결을 Drizzle로 구현한다 */
import type {
  InsertQuestionAttemptInput,
  QuestionAttemptRepository,
  QuestionAttemptTransaction,
  SavedContentRepository,
} from '@flex-thia/domain';
import { and, eq, sql } from 'drizzle-orm';
import { alias, type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionAttempts,
  questionOptions,
  questionVersions,
  questions,
  savedQuestions,
  savedVocabularies,
  users,
  vocabularies,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type LearningDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type LearningTransactionSession = Pick<
  LearningDatabase,
  'delete' | 'insert' | 'select'
>;

/** 예상하지 못한 학습 저장 결과를 외부 기술 오류와 분리해 전달한다 */
export class LearningPersistenceError extends Error {
  readonly code = 'LEARNING_PERSISTENCE_CONFLICT';

  constructor(readonly operation: string) {
    super(`LEARNING_PERSISTENCE_CONFLICT:${operation}`);
    this.name = 'LearningPersistenceError';
  }
}

const assertAtMostOne = <T>(rows: T[], operation: string): T | null => {
  if (rows.length > 1) {
    throw new LearningPersistenceError(operation);
  }
  return rows[0] ?? null;
};

const assertExactlyOne = <T>(rows: T[], operation: string): T => {
  if (rows.length !== 1) {
    throw new LearningPersistenceError(operation);
  }
  return rows[0] as T;
};

const createQuestionAttemptTransaction = (
  transaction: LearningTransactionSession,
): QuestionAttemptTransaction => {
  const selectedOptions = alias(questionOptions, 'selected_question_options');
  const correctOptions = alias(questionOptions, 'correct_question_options');

  return {
    async findByClientAttemptId(userId, clientAttemptId) {
      const rows = await transaction
        .select({
          id: questionAttempts.id,
          userId: questionAttempts.userId,
          questionId: questionAttempts.questionId,
          questionVersionId: questionAttempts.questionVersionId,
          attemptNo: questionAttempts.attemptNo,
          selectedOptionId: questionAttempts.selectedOptionId,
          clientAttemptId: questionAttempts.clientAttemptId,
          durationMs: questionAttempts.durationMs,
          isCorrect: questionAttempts.isCorrect,
          submittedAt: questionAttempts.submittedAt,
        })
        .from(questionAttempts)
        .where(
          and(
            eq(questionAttempts.userId, userId),
            eq(questionAttempts.clientAttemptId, clientAttemptId),
          ),
        )
        .limit(2);
      return assertAtMostOne(rows, 'findByClientAttemptId');
    },

    async loadSubmissionTarget(
      questionId,
      questionVersionId,
      selectedOptionId,
    ) {
      const rows = await transaction
        .select({
          questionStatus: questions.status,
          currentPublishedVersionId: questions.currentPublishedVersionId,
          questionVersionStatus: questionVersions.status,
          selectedOptionId: selectedOptions.id,
          correctOptionId: correctOptions.id,
        })
        .from(questions)
        .leftJoin(
          questionVersions,
          and(
            eq(questionVersions.questionId, questions.id),
            eq(questionVersions.id, questionVersionId),
          ),
        )
        .leftJoin(
          selectedOptions,
          and(
            eq(selectedOptions.id, selectedOptionId),
            eq(selectedOptions.questionVersionId, questionVersions.id),
          ),
        )
        .leftJoin(
          correctOptions,
          and(
            eq(correctOptions.questionVersionId, questionVersions.id),
            eq(correctOptions.isCorrect, true),
          ),
        )
        .where(eq(questions.id, questionId))
        .limit(2);
      return assertAtMostOne(rows, 'loadSubmissionTarget');
    },

    async readNextAttemptNo(userId, questionId) {
      const rows = await transaction
        .select({
          nextAttemptNo:
            sql<number>`coalesce(max(${questionAttempts.attemptNo}), 0) + 1`.mapWith(
              Number,
            ),
        })
        .from(questionAttempts)
        .where(
          and(
            eq(questionAttempts.userId, userId),
            eq(questionAttempts.questionId, questionId),
          ),
        )
        .limit(2);
      return assertExactlyOne(rows, 'readNextAttemptNo').nextAttemptNo;
    },

    async insertAttempt(input: InsertQuestionAttemptInput) {
      const rows = await transaction
        .insert(questionAttempts)
        .values(input)
        .returning({ id: questionAttempts.id });
      assertExactlyOne(rows, 'insertAttempt');
    },

    async loadCorrectOptionId(questionVersionId) {
      // 재전송 피드백은 현재 버전 상태와 무관하게 제출 당시 버전에서 복원한다.
      const rows = await transaction
        .select({ correctOptionId: questionOptions.id })
        .from(questionOptions)
        .where(
          and(
            eq(questionOptions.questionVersionId, questionVersionId),
            eq(questionOptions.isCorrect, true),
          ),
        )
        .limit(2);
      return assertExactlyOne(rows, 'loadCorrectOptionId').correctOptionId;
    },
  };
};

/** PostgreSQL row lock으로 답안 번호·멱등 판정을 직렬화하고 저장 연결을 관리한다 */
export class DrizzleLearningRepository
  implements QuestionAttemptRepository, SavedContentRepository
{
  constructor(private readonly database: LearningDatabase) {}

  /** ACTIVE user row lock 뒤 같은 transaction에서 답안 callback을 실행한다 */
  async runInTransaction<T>(
    userId: string,
    work: (transaction: QuestionAttemptTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.status, 'ACTIVE')))
        .for('update')
        .limit(2);
      assertExactlyOne(rows, 'lockActiveUser');
      return work(createQuestionAttemptTransaction(transaction));
    });
  }

  /** 문제와 current version이 모두 게시된 저장 대상인지 확인한다 */
  async isQuestionAvailable(questionId: string): Promise<boolean> {
    const rows = await this.database
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.id, questions.currentPublishedVersionId),
          eq(questionVersions.questionId, questions.id),
        ),
      )
      .where(
        and(
          eq(questions.id, questionId),
          eq(questions.status, 'PUBLISHED'),
          eq(questionVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    return rows.length === 1;
  }

  /** 통합 전 기존 endpoint가 게시 어휘만 저장하도록 유지한다 */
  async isVocabularyAvailable(vocabularyId: string): Promise<boolean> {
    const rows = await this.database
      .select({ id: vocabularies.id })
      .from(vocabularies)
      .where(
        and(
          eq(vocabularies.id, vocabularyId),
          eq(vocabularies.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    return rows.length === 1;
  }

  /** 중복 저장 요청은 기존 문제 연결을 그대로 유지한다 */
  async saveQuestion(
    userId: string,
    questionId: string,
    savedAt: Date,
  ): Promise<void> {
    await this.database
      .insert(savedQuestions)
      .values({ userId, questionId, savedAt })
      .onConflictDoNothing();
  }

  /** 대상 노출 상태와 무관하게 문제 연결 삭제를 멱등 처리한다 */
  async removeQuestion(userId: string, questionId: string): Promise<void> {
    await this.database
      .delete(savedQuestions)
      .where(
        and(
          eq(savedQuestions.userId, userId),
          eq(savedQuestions.questionId, questionId),
        ),
      );
  }

  /** 통합 전 기존 저장 어휘 연결의 conflict를 멱등 처리한다 */
  async saveVocabulary(
    userId: string,
    vocabularyId: string,
    savedAt: Date,
  ): Promise<void> {
    await this.database
      .insert(savedVocabularies)
      .values({ userId, vocabularyId, savedAt })
      .onConflictDoNothing();
  }

  /** 통합 전 기존 저장 어휘 연결 삭제를 멱등 처리한다 */
  async removeVocabulary(userId: string, vocabularyId: string): Promise<void> {
    await this.database
      .delete(savedVocabularies)
      .where(
        and(
          eq(savedVocabularies.userId, userId),
          eq(savedVocabularies.vocabularyId, vocabularyId),
        ),
      );
  }
}

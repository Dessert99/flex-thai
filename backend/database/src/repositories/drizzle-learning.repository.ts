/** 사용자 잠금·문제 공유 잠금으로 멱등 제출과 관리자 수정의 경쟁을 막는다. */
import type {
  QuestionAttemptRepository,
  QuestionAttemptTransaction,
} from '@flex-thia/domain/learning/question-attempt.repository';
import type { SavedContentRepository } from '@flex-thia/domain/learning/saved-content.repository';
import { and, eq, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema } from '../schema/databaseSchema.js';
import { users } from '../schema/identity.schema.js';
import { questionAttempts, savedQuestions } from '../schema/learning.schema.js';
import { questions } from '../schema/questions.schema.js';
import { vocabularies } from '../schema/vocabulary.schema.js';

type Database = PgDatabase<PgQueryResultHKT, typeof databaseSchema>;
export class LearningPersistenceError extends Error {
  readonly code = 'LEARNING_PERSISTENCE_CONFLICT';
  constructor(readonly operation: string) {
    super(`LEARNING_PERSISTENCE_CONFLICT:${operation}`);
  }
}
export class DrizzleLearningRepository
  implements QuestionAttemptRepository, SavedContentRepository
{
  constructor(private readonly database: Database) {}
  runInTransaction<T>(
    userId: string,
    work: (transaction: QuestionAttemptTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.status, 'ACTIVE')))
        .for('update');
      if (!user) throw new LearningPersistenceError('lockActiveUser');
      return work({
        async findByClientAttemptId(userId, clientAttemptId) {
          const [row] = await tx
            .select()
            .from(questionAttempts)
            .where(
              and(
                eq(questionAttempts.userId, userId),
                eq(questionAttempts.clientAttemptId, clientAttemptId),
              ),
            );
          return row ?? null;
        },
        async loadSubmissionTarget(questionId) {
          const [row] = await tx
            .select()
            .from(questions)
            .where(eq(questions.id, questionId))
            .for('share');
          if (!row) return null;
          return {
            status: row.status,
            snapshot: {
              updatedAt: row.updatedAt.toISOString(),
              version: row.version,
              typeVersionId: row.typeVersionId,
              difficulty: row.difficulty,
              passage: row.passage,
              prompt: row.prompt,
              options: row.options,
              correctOptionId: row.correctOptionId,
              explanation: row.explanation,
            },
          };
        },
        async readNextAttemptNo(userId, questionId) {
          const [row] = await tx
            .select({
              next: sql<number>`coalesce(max(${questionAttempts.attemptNo}), 0) + 1`.mapWith(
                Number,
              ),
            })
            .from(questionAttempts)
            .where(
              and(
                eq(questionAttempts.userId, userId),
                eq(questionAttempts.questionId, questionId),
              ),
            );
          return row!.next;
        },
        async insertAttempt(input) {
          await tx.insert(questionAttempts).values(input);
        },
      });
    });
  }
  async isQuestionAvailable(questionId: string): Promise<boolean> {
    return (
      (
        await this.database
          .select({ id: questions.id })
          .from(questions)
          .where(
            and(
              eq(questions.id, questionId),
              eq(questions.status, 'PUBLISHED'),
            ),
          )
      ).length > 0
    );
  }
  async isVocabularyAvailable(vocabularyId: string): Promise<boolean> {
    return (
      (
        await this.database
          .select({ id: vocabularies.id })
          .from(vocabularies)
          .where(
            and(
              eq(vocabularies.id, vocabularyId),
              eq(vocabularies.status, 'PUBLISHED'),
            ),
          )
      ).length > 0
    );
  }
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
}

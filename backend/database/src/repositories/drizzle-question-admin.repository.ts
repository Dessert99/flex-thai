/** 현재 문제·어휘 사용·감사를 원자적으로 저장한다. */
import type {
  QuestionAdminRepository,
  QuestionAdminTransaction,
} from '@flex-thia/domain/questions/question-admin.repository';
import { and, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema as schema } from '../schema/databaseSchema.js';
import { auditLogs } from '../schema/identity.schema.js';
import {
  questions,
  questionTags,
  questionTopics,
  questionTypeVersions,
  questionVocabularies,
} from '../schema/questions.schema.js';
import {
  vocabularies,
  vocabularyMeanings,
} from '../schema/vocabulary.schema.js';
export class QuestionAdminPersistenceError extends Error {
  readonly code = 'QUESTION_ADMIN_PERSISTENCE_CONFLICT';
  constructor(readonly operation: string) {
    super(operation);
  }
}
export class DrizzleQuestionAdminRepository implements QuestionAdminRepository {
  constructor(
    private readonly database: PgDatabase<PgQueryResultHKT, typeof schema>,
  ) {}
  runInTransaction<T>(
    work: (transaction: QuestionAdminTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (tx) =>
      work({
        async loadQuestion(id) {
          const [row] = await tx
            .select()
            .from(questions)
            .where(eq(questions.id, id))
            .for('update');
          if (!row) return null;
          const usage = await tx
            .select()
            .from(questionVocabularies)
            .where(eq(questionVocabularies.questionId, id));
          return {
            ...row,
            vocabularies: usage.map(
              ({ vocabularyId, meaningId, role, occurrenceCount }) => ({
                vocabularyId,
                meaningId,
                role,
                occurrenceCount,
              }),
            ),
          };
        },
        async validateReferences(input) {
          const [type] = await tx
            .select()
            .from(questionTypeVersions)
            .where(
              and(
                eq(questionTypeVersions.id, input.typeVersionId),
                eq(questionTypeVersions.status, 'ACTIVE'),
              ),
            )
            .for('share');
          const [topic] = await tx
            .select()
            .from(questionTopics)
            .where(
              and(
                eq(questionTopics.id, input.topicId),
                eq(questionTopics.status, 'ACTIVE'),
              ),
            )
            .for('share');
          if (!type || !topic || type.optionCount !== input.options.length)
            return false;
          if (input.tagIds.length) {
            const tags = await tx
              .select()
              .from(questionTags)
              .where(
                and(
                  inArray(questionTags.id, input.tagIds),
                  eq(questionTags.status, 'ACTIVE'),
                ),
              )
              .for('share');
            if (tags.length !== input.tagIds.length) return false;
          }
          for (const usage of [...input.vocabularies].sort((a, b) =>
            a.vocabularyId.localeCompare(b.vocabularyId),
          )) {
            const [word] = await tx
              .select()
              .from(vocabularies)
              .where(
                and(
                  eq(vocabularies.id, usage.vocabularyId),
                  eq(vocabularies.status, 'PUBLISHED'),
                ),
              )
              .for('share');
            if (!word) return false;
            if (usage.meaningId !== null) {
              const [meaning] = await tx
                .select()
                .from(vocabularyMeanings)
                .where(
                  and(
                    eq(vocabularyMeanings.id, usage.meaningId),
                    eq(vocabularyMeanings.vocabularyId, usage.vocabularyId),
                  ),
                )
                .for('share');
              if (!meaning) return false;
            }
          }
          return true;
        },
        async saveQuestion(record) {
          const { vocabularies: usage, ...row } = record;
          await tx
            .insert(questions)
            .values(row)
            .onConflictDoUpdate({ target: questions.id, set: row });
          await tx
            .delete(questionVocabularies)
            .where(eq(questionVocabularies.questionId, row.id));
          if (usage.length)
            await tx
              .insert(questionVocabularies)
              .values(usage.map((item) => ({ ...item, questionId: row.id })));
        },
        async appendAuditLog(input) {
          await tx
            .insert(auditLogs)
            .values({
              actorSub: input.actorSub,
              actorUserId: input.actorUserId,
              action: input.action,
              target: input.targetId,
              targetType: 'QUESTION',
              targetId: input.targetId,
              summary: input.summary,
              requestId: input.requestId,
              createdAt: input.occurredAt,
            });
        },
      }),
    );
  }
}

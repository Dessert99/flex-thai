/** 현재 문제와 사용 어휘를 관리자에게 조회한다. */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema as schema } from '../schema/databaseSchema.js';
import {
  questions,
  questionTypes,
  questionTypeVersions,
  questionVocabularies,
} from '../schema/questions.schema.js';
export interface AdminQuestionListQuery {
  page: number;
  pageSize: number;
  status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | undefined;
  questionTypeSlug?: string | undefined;
  skill?: 'READING' | undefined;
  difficulty?: number | undefined;
}
export class DrizzleAdminQuestionQuery {
  constructor(
    private readonly database: PgDatabase<PgQueryResultHKT, typeof schema>,
  ) {}
  async list(query: AdminQuestionListQuery) {
    const conditions = [
      query.status ? eq(questions.status, query.status) : undefined,
      query.difficulty ? eq(questions.difficulty, query.difficulty) : undefined,
      query.questionTypeSlug
        ? eq(questionTypes.slug, query.questionTypeSlug)
        : undefined,
    ];
    const [{ count } = { count: 0 }] = await this.database
      .select({ count: sql<number>`count(*)::int` })
      .from(questions)
      .innerJoin(
        questionTypeVersions,
        eq(questions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .where(and(...conditions));
    const items = await this.database
      .select({
        questionId: questions.id,
        version: questions.version,
        status: questions.status,
        prompt: questions.prompt,
        questionTypeSlug: questionTypes.slug,
        difficulty: questions.difficulty,
        updatedAt: questions.updatedAt,
      })
      .from(questions)
      .innerJoin(
        questionTypeVersions,
        eq(questions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .where(and(...conditions))
      .orderBy(desc(questions.updatedAt), questions.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items,
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: count,
        totalPages: Math.ceil(count / query.pageSize),
      },
    };
  }
  async findById(id: string) {
    const [row] = await this.database
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    if (!row) return null;
    const usage = await this.database
      .select()
      .from(questionVocabularies)
      .where(eq(questionVocabularies.questionId, id));
    const { id: questionId, ...content } = row;
    return {
      questionId,
      ...content,
      vocabularies: usage.map(
        ({ vocabularyId, meaningId, role, occurrenceCount }) => ({
          vocabularyId,
          meaningId,
          role,
          occurrenceCount,
        }),
      ),
    };
  }
}

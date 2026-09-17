/** 현재 문제를 한 행에서 읽고 사용자별 마지막 풀이 버전을 비교한다. */
import type {
  QuestionLearningStatus,
  QuestionSnapshot,
} from '@flex-thia/domain/questions/question';
import type { QuestionMajorCategory } from '@flex-thia/domain/questions/question-taxonomy.repository';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { alias, type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema } from '../schema/databaseSchema.js';
import { questionAttempts, savedQuestions } from '../schema/learning.schema.js';
import {
  questions,
  questionTags,
  questionTopics,
  questionTypes,
  questionTypeVersions,
  questionVocabularies,
} from '../schema/questions.schema.js';

type Database = PgDatabase<PgQueryResultHKT, typeof databaseSchema>;
export type LearnerQuestionSkill = 'READING';
export type LearnerQuestionFirstResult = QuestionLearningStatus;
export interface LearnerQuestionPageQuery {
  page: number;
  pageSize: number;
}
export interface LearnerQuestionListQuery extends LearnerQuestionPageQuery {
  vocabularyId?: string;
  skill?: LearnerQuestionSkill;
  majorCategory?: QuestionMajorCategory;
  questionTypeId?: string;
  topicId?: string;
  tagId?: string;
  difficulty?: number;
  saved?: boolean;
  firstResult?: LearnerQuestionFirstResult;
  sort: 'LATEST';
}
export interface LearnerQuestionTypeProjection {
  id: string;
  slug: string;
  displayName: string;
}
export type LearnerQuestionTaxonomyTermProjection =
  LearnerQuestionTypeProjection;
export interface LearnerQuestionPageMetadata extends LearnerQuestionPageQuery {
  totalItems: number;
  totalPages: number;
}
export interface LearnerQuestionListItemProjection {
  questionId: string;
  questionVersion: number;
  questionType: LearnerQuestionTypeProjection;
  majorCategory: QuestionMajorCategory;
  topic: LearnerQuestionTaxonomyTermProjection;
  tags: LearnerQuestionTaxonomyTermProjection[];
  skill: LearnerQuestionSkill;
  difficulty: number;
  saved: boolean;
  firstResult: LearnerQuestionFirstResult;
}
export interface LearnerQuestionListProjection {
  items: LearnerQuestionListItemProjection[];
  page: LearnerQuestionPageMetadata;
}
export interface LearnerQuestionListFacetsProjection {
  majorCategories: Array<{ value: QuestionMajorCategory; label: string }>;
  questionTypes: Array<
    LearnerQuestionTypeProjection & { majorCategory: QuestionMajorCategory }
  >;
  topics: LearnerQuestionTaxonomyTermProjection[];
  tags: LearnerQuestionTaxonomyTermProjection[];
}
const pageOf = (query: LearnerQuestionPageQuery, totalItems: number) => ({
  ...query,
  totalItems,
  totalPages: Math.ceil(totalItems / query.pageSize),
});
const savedFor = (userId: string) =>
  sql<boolean>`exists (select 1 from ${savedQuestions} where ${savedQuestions.userId} = ${userId} and ${savedQuestions.questionId} = ${questions.id})`;
const lastAttempt = alias(questionAttempts, 'latest_question_attempt');
const lastFor = (userId: string) =>
  and(
    eq(lastAttempt.userId, userId),
    eq(lastAttempt.questionId, questions.id),
    sql`${lastAttempt.attemptNo} = (select max(a.attempt_no) from question_attempts a where a.user_id = ${userId} and a.question_id = ${questions.id})`,
  );
const learningStatus = sql<LearnerQuestionFirstResult>`case when ${lastAttempt.id} is null then 'UNANSWERED' when ${lastAttempt.questionVersion} <> ${questions.version} then 'UPDATED' when ${lastAttempt.isCorrect} then 'CORRECT' else 'INCORRECT' end`;
const labels = {
  READING_VOCABULARY_GRAMMAR: '어휘·문법',
  READING_SYNONYM_RELATION: '동의·유의 관계',
  READING_ERROR_IDENTIFICATION: '비문 찾기',
  READING_PASSAGE: '지문 독해',
} as const;
export class DrizzleLearnerQuestionQuery {
  constructor(private readonly database: Database) {}
  async listQuestions(
    userId: string,
    query: LearnerQuestionListQuery,
  ): Promise<LearnerQuestionListProjection> {
    const conditions = and(
      eq(questions.status, 'PUBLISHED'),
      query.vocabularyId
        ? sql`exists(select 1 from ${questionVocabularies} where ${questionVocabularies.questionId} = ${questions.id} and ${questionVocabularies.vocabularyId} = ${query.vocabularyId})`
        : undefined,
      query.majorCategory
        ? eq(questionTypes.majorCategory, query.majorCategory)
        : undefined,
      query.questionTypeId
        ? eq(questionTypes.id, query.questionTypeId)
        : undefined,
      query.topicId ? eq(questions.topicId, query.topicId) : undefined,
      query.tagId
        ? sql`${query.tagId}::uuid = any(${questions.tagIds})`
        : undefined,
      query.difficulty ? eq(questions.difficulty, query.difficulty) : undefined,
      query.saved === undefined
        ? undefined
        : sql`${savedFor(userId)} = ${query.saved}`,
      query.firstResult
        ? sql`${learningStatus} = ${query.firstResult}`
        : undefined,
    );
    const totals = await this.database
      .select({ total: count() })
      .from(questions)
      .innerJoin(
        questionTypeVersions,
        eq(questions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .leftJoin(lastAttempt, lastFor(userId))
      .where(conditions);
    const rows = await this.database
      .select({
        questionId: questions.id,
        questionVersion: questions.version,
        questionType: {
          id: questionTypes.id,
          slug: questionTypes.slug,
          displayName: questionTypes.displayName,
        },
        majorCategory: questionTypes.majorCategory,
        skill: questionTypes.skill,
        topic: {
          id: questionTopics.id,
          slug: questionTopics.slug,
          displayName: questionTopics.displayName,
        },
        tagIds: questions.tagIds,
        difficulty: questions.difficulty,
        saved: savedFor(userId),
        firstResult: learningStatus,
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
      .innerJoin(questionTopics, eq(questions.topicId, questionTopics.id))
      .leftJoin(lastAttempt, lastFor(userId))
      .where(conditions)
      .orderBy(desc(questions.publishedAt), asc(questions.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const tags = await this.database
      .select({
        id: questionTags.id,
        slug: questionTags.slug,
        displayName: questionTags.displayName,
      })
      .from(questionTags);
    return {
      items: rows.map(({ tagIds, ...row }) => ({
        ...row,
        tags: tags.filter((tag) => tagIds.includes(tag.id)),
      })),
      page: pageOf(
        { page: query.page, pageSize: query.pageSize },
        totals[0]?.total ?? 0,
      ),
    };
  }
  async getQuestionDetail(userId: string, questionId: string) {
    const [row] = await this.database
      .select({
        questionId: questions.id,
        questionVersion: questions.version,
        questionType: {
          id: questionTypes.id,
          slug: questionTypes.slug,
          displayName: questionTypes.displayName,
        },
        skill: questionTypes.skill,
        difficulty: questions.difficulty,
        passage: questions.passage,
        prompt: questions.prompt,
        options: questions.options,
        saved: savedFor(userId),
        firstResult: learningStatus,
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
      .leftJoin(lastAttempt, lastFor(userId))
      .where(
        and(eq(questions.id, questionId), eq(questions.status, 'PUBLISHED')),
      );
    return row ?? null;
  }
  async listAttempts(userId: string, query: LearnerQuestionPageQuery) {
    const [total] = await this.database
      .select({ count: count() })
      .from(questionAttempts)
      .where(eq(questionAttempts.userId, userId));
    const rows = await this.database
      .select()
      .from(questionAttempts)
      .where(eq(questionAttempts.userId, userId))
      .orderBy(desc(questionAttempts.submittedAt), desc(questionAttempts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map(({ userId, ...row }) => {
        void userId;
        return row;
      }),
      page: pageOf(query, total?.count ?? 0),
    };
  }
  async listQuestionFacets(): Promise<LearnerQuestionListFacetsProjection> {
    const types = await this.database
      .selectDistinct({
        id: questionTypes.id,
        slug: questionTypes.slug,
        displayName: questionTypes.displayName,
        majorCategory: questionTypes.majorCategory,
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
      .where(eq(questions.status, 'PUBLISHED'))
      .orderBy(asc(questionTypes.slug));
    const topics = await this.database
      .selectDistinct({
        id: questionTopics.id,
        slug: questionTopics.slug,
        displayName: questionTopics.displayName,
      })
      .from(questions)
      .innerJoin(questionTopics, eq(questions.topicId, questionTopics.id))
      .where(eq(questions.status, 'PUBLISHED'))
      .orderBy(asc(questionTopics.slug));
    const tags = await this.database
      .selectDistinct({
        id: questionTags.id,
        slug: questionTags.slug,
        displayName: questionTags.displayName,
      })
      .from(questionTags)
      .innerJoin(questions, sql`${questionTags.id} = any(${questions.tagIds})`)
      .where(eq(questions.status, 'PUBLISHED'))
      .orderBy(asc(questionTags.slug));
    return {
      questionTypes: types,
      topics,
      tags,
      majorCategories: [
        ...new Set(types.map((type) => type.majorCategory)),
      ].map((value) => ({ value, label: labels[value] })),
    };
  }
}
export type LearnerQuestionDetailProjection = NonNullable<
  Awaited<ReturnType<DrizzleLearnerQuestionQuery['getQuestionDetail']>>
>;
export interface LearnerQuestionAttemptProjection {
  id: string;
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
export interface LearnerQuestionAttemptListProjection {
  items: LearnerQuestionAttemptProjection[];
  page: LearnerQuestionPageMetadata;
}

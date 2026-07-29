/** AI 문제 후보와 allow-list 검증 evidence를 private hash 없이 조회한다 */
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from '../schema/index.js';
import {
  questionProductionCandidates,
  questionProductionValidations,
} from '../schema/ai-question-production.schema.js';
import { jobItems } from '../schema/jobs.schema.js';
import { questionTags } from '../schema/questions.schema.js';

type CandidateDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 후보 page에 적용할 저장 필터 */
export interface QuestionCandidateQueryInput {
  jobId?: string;
  jobItemId?: string;
  resultGroup?: 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';
  reviewStatus?: 'PENDING' | 'APPROVED' | 'DISCARDED';
  page: number;
  pageSize: number;
}

const candidateSelection = {
  id: questionProductionCandidates.id,
  jobId: jobItems.jobId,
  jobItemId: questionProductionCandidates.jobItemId,
  jobAttempt: questionProductionCandidates.jobAttempt,
  ordinal: questionProductionCandidates.ordinal,
  questionTypeVersionId: questionProductionCandidates.typeVersionId,
  payloadState: questionProductionCandidates.payloadState,
  topicId: questionProductionCandidates.topicId,
  difficulty: questionProductionCandidates.difficulty,
  payload: questionProductionCandidates.payload,
  resultGroup: questionProductionCandidates.resultGroup,
  reviewStatus: questionProductionCandidates.reviewStatus,
  reviewCode: questionProductionCandidates.reviewCode,
  regeneratedFromCandidateId:
    questionProductionCandidates.regeneratedFromCandidateId,
  approvedQuestionId: questionProductionCandidates.approvedQuestionId,
  approvedQuestionVersionId:
    questionProductionCandidates.approvedQuestionVersionId,
  revision: questionProductionCandidates.revision,
  createdAt: questionProductionCandidates.createdAt,
  updatedAt: questionProductionCandidates.updatedAt,
};

type CandidateRow = {
  id: string;
  jobId: string;
  jobItemId: string;
  jobAttempt: number;
  ordinal: number;
  questionTypeVersionId: string;
  payloadState: 'CANONICAL' | 'REDACTED_INVALID';
  topicId: string | null;
  difficulty: number | null;
  payload: Record<string, unknown> | null;
  resultGroup: 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';
  reviewStatus: 'PENDING' | 'APPROVED' | 'DISCARDED';
  reviewCode: string | null;
  regeneratedFromCandidateId: string | null;
  approvedQuestionId: string | null;
  approvedQuestionVersionId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

const tagSlugsFrom = (row: CandidateRow): string[] | null => {
  if (row.payloadState === 'REDACTED_INVALID') return [];
  const tagSlugs = row.payload?.['tagSlugs'];
  return Array.isArray(tagSlugs) &&
    tagSlugs.every((slug): slug is string => typeof slug === 'string')
    ? tagSlugs
    : null;
};

const redact = (row: CandidateRow) => ({
  ...row,
  payloadState: 'REDACTED_INVALID' as const,
  topicId: null,
  tagIds: [] as [],
  difficulty: null,
  payload: null,
});

/** 저장된 CANONICAL 후보의 참조 무결성 위반을 private 값 없는 code로 알린다 */
export class QuestionCandidateDataIntegrityError extends Error {
  constructor() {
    super('QUESTION_CANDIDATE_DATA_INTEGRITY_INVALID');
    this.name = 'QuestionCandidateDataIntegrityError';
  }
}

/** 저장된 tag slug를 비활성 row까지 포함해 truthful ID projection으로 바꾼다 */
const projectCandidates = async (
  database: CandidateDatabase,
  rows: CandidateRow[],
) => {
  const slugsByCandidate = new Map(
    rows.map((row) => [row.id, tagSlugsFrom(row)]),
  );
  const slugs = [
    ...new Set(
      [...slugsByCandidate.values()].flatMap(
        (candidateSlugs) => candidateSlugs ?? [],
      ),
    ),
  ];
  const tagRows =
    slugs.length === 0
      ? []
      : await database
          .select({ id: questionTags.id, slug: questionTags.slug })
          .from(questionTags)
          .where(inArray(questionTags.slug, slugs));
  const idsBySlug = new Map(tagRows.map((tag) => [tag.slug, tag.id]));

  return rows.map((row) => {
    const candidateSlugs = slugsByCandidate.get(row.id);
    if (row.payloadState === 'REDACTED_INVALID') return redact(row);
    if (
      candidateSlugs === null ||
      candidateSlugs === undefined ||
      row.topicId === null ||
      row.difficulty === null ||
      row.payload === null
    ) {
      throw new QuestionCandidateDataIntegrityError();
    }
    const tagIds = candidateSlugs.flatMap((slug) => {
      const id = idsBySlug.get(slug);
      return id ? [id] : [];
    });
    if (tagIds.length !== candidateSlugs.length) {
      throw new QuestionCandidateDataIntegrityError();
    }
    return {
      ...row,
      payloadState: 'CANONICAL' as const,
      topicId: row.topicId,
      difficulty: row.difficulty,
      payload: row.payload,
      tagIds,
    };
  });
};

/** AI 문제 후보 목록·상세 read model을 PostgreSQL에서 조립한다 */
export class DrizzleQuestionCandidateQuery {
  constructor(private readonly database: CandidateDatabase) {}

  /** 작업·검토 상태 필터의 최신 후보 page를 반환한다 */
  async list(input: QuestionCandidateQueryInput) {
    const condition = and(
      input.jobId ? eq(jobItems.jobId, input.jobId) : undefined,
      input.jobItemId
        ? eq(questionProductionCandidates.jobItemId, input.jobItemId)
        : undefined,
      input.resultGroup
        ? eq(questionProductionCandidates.resultGroup, input.resultGroup)
        : undefined,
      input.reviewStatus
        ? eq(questionProductionCandidates.reviewStatus, input.reviewStatus)
        : undefined,
    );
    const [{ totalItems = 0 } = {}] = await this.database
      .select({ totalItems: count(questionProductionCandidates.id) })
      .from(questionProductionCandidates)
      .innerJoin(
        jobItems,
        eq(questionProductionCandidates.jobItemId, jobItems.id),
      )
      .where(condition);
    const rows = await this.database
      .select(candidateSelection)
      .from(questionProductionCandidates)
      .innerJoin(
        jobItems,
        eq(questionProductionCandidates.jobItemId, jobItems.id),
      )
      .where(condition)
      .orderBy(
        desc(questionProductionCandidates.createdAt),
        desc(questionProductionCandidates.id),
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    return {
      items: await projectCandidates(this.database, rows),
      totalItems,
    };
  }

  /** 후보 payload와 검증 단계 allow-list row를 함께 반환한다 */
  async findById(candidateId: string) {
    const [row] = await this.database
      .select(candidateSelection)
      .from(questionProductionCandidates)
      .innerJoin(
        jobItems,
        eq(questionProductionCandidates.jobItemId, jobItems.id),
      )
      .where(eq(questionProductionCandidates.id, candidateId))
      .limit(1);
    if (!row) return null;
    const [candidate] = await projectCandidates(this.database, [row]);
    const validations = await this.database
      .select({
        stage: questionProductionValidations.stage,
        status: questionProductionValidations.status,
        code: questionProductionValidations.code,
        details: questionProductionValidations.details,
        createdAt: questionProductionValidations.createdAt,
      })
      .from(questionProductionValidations)
      .where(eq(questionProductionValidations.candidateId, candidateId))
      .orderBy(asc(questionProductionValidations.stage));
    return { candidate: candidate!, validations };
  }
}

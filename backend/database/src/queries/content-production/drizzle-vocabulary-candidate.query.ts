/** AI 어휘 후보 목록·상세를 검수 lifecycle과 validation 순서로 조회한다 */
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { VocabularyCandidateQuery } from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  vocabularyProductionCandidates,
  vocabularyProductionValidations,
} from '../../schema/ai-vocabulary-production.schema.js';
import { jobItems } from '../../schema/jobs.schema.js';
import * as schema from '../../schema/index.js';

type CandidateDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

const candidateSelection = {
  id: vocabularyProductionCandidates.id,
  jobId: jobItems.jobId,
  jobItemId: vocabularyProductionCandidates.jobItemId,
  jobAttempt: vocabularyProductionCandidates.jobAttempt,
  ordinal: vocabularyProductionCandidates.ordinal,
  thai: vocabularyProductionCandidates.thai,
  normalizedThai: vocabularyProductionCandidates.normalizedThai,
  kind: vocabularyProductionCandidates.kind,
  meanings: vocabularyProductionCandidates.meanings,
  classification: vocabularyProductionCandidates.classification,
  resultGroup: vocabularyProductionCandidates.resultGroup,
  matchedVocabularyId: vocabularyProductionCandidates.matchedVocabularyId,
  suspectedMatches: vocabularyProductionCandidates.suspectedMatches,
  reviewCode: vocabularyProductionCandidates.reviewCode,
  reviewStatus: vocabularyProductionCandidates.reviewStatus,
  revision: vocabularyProductionCandidates.revision,
  resolutionKind: vocabularyProductionCandidates.resolutionKind,
  resolvedVocabularyId: vocabularyProductionCandidates.resolvedVocabularyId,
  createdAt: vocabularyProductionCandidates.createdAt,
  updatedAt: vocabularyProductionCandidates.updatedAt,
};

type CandidateRow = Omit<
  Awaited<ReturnType<VocabularyCandidateQuery['list']>>['items'][number],
  'resolution'
> & {
  resolutionKind: 'DRAFT_CREATED' | 'EXISTING_LINKED' | null;
  resolvedVocabularyId: string | null;
};

/** 저장된 승인 resolution이 lifecycle과 불일치할 때 fail-closed한다 */
export class VocabularyCandidateDataIntegrityError extends Error {
  constructor() {
    super('VOCABULARY_CANDIDATE_DATA_INTEGRITY_INVALID');
    this.name = 'VocabularyCandidateDataIntegrityError';
  }
}

const projectCandidate = (row: CandidateRow) => {
  const { resolutionKind, resolvedVocabularyId } = row;
  if (row.reviewStatus !== 'APPROVED') {
    if (resolutionKind !== null || resolvedVocabularyId !== null) {
      throw new VocabularyCandidateDataIntegrityError();
    }
    return { ...row, resolution: null };
  }
  if (resolutionKind === null || resolvedVocabularyId === null) {
    throw new VocabularyCandidateDataIntegrityError();
  }
  if (resolutionKind === 'DRAFT_CREATED') {
    return {
      ...row,
      resolution: {
        kind: 'DRAFT_CREATED' as const,
        vocabularyId: resolvedVocabularyId,
      },
    };
  }
  return {
    ...row,
    resolution: {
      kind: 'EXISTING_LINKED' as const,
      vocabularyId: resolvedVocabularyId,
    },
  };
};

/** AI 어휘 후보 목록·상세 read model을 PostgreSQL에서 조립한다 */
export class DrizzleVocabularyCandidateQuery implements VocabularyCandidateQuery {
  constructor(private readonly database: CandidateDatabase) {}

  /** status와 job filter를 page 계산 전에 동일하게 적용한다 */
  async list(input: Parameters<VocabularyCandidateQuery['list']>[0]) {
    const condition = and(
      input.jobId ? eq(jobItems.jobId, input.jobId) : undefined,
      input.reviewStatus
        ? eq(vocabularyProductionCandidates.reviewStatus, input.reviewStatus)
        : undefined,
    );
    const [{ totalItems = 0 } = {}] = await this.database
      .select({ totalItems: count(vocabularyProductionCandidates.id) })
      .from(vocabularyProductionCandidates)
      .innerJoin(
        jobItems,
        eq(vocabularyProductionCandidates.jobItemId, jobItems.id),
      )
      .where(condition);
    const rows = await this.database
      .select(candidateSelection)
      .from(vocabularyProductionCandidates)
      .innerJoin(
        jobItems,
        eq(vocabularyProductionCandidates.jobItemId, jobItems.id),
      )
      .where(condition)
      .orderBy(
        desc(vocabularyProductionCandidates.createdAt),
        desc(vocabularyProductionCandidates.id),
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    return {
      items: (rows as CandidateRow[]).map(projectCandidate),
      totalItems,
    };
  }

  /** 후보 snapshot과 validation을 결정된 stage ordinal 순으로 반환한다 */
  async findById(candidateId: string) {
    const [row] = await this.database
      .select(candidateSelection)
      .from(vocabularyProductionCandidates)
      .innerJoin(
        jobItems,
        eq(vocabularyProductionCandidates.jobItemId, jobItems.id),
      )
      .where(eq(vocabularyProductionCandidates.id, candidateId))
      .limit(1);
    if (!row) return null;
    const validations = await this.database
      .select({
        stage: vocabularyProductionValidations.stage,
        status: vocabularyProductionValidations.status,
        code: vocabularyProductionValidations.code,
        details: vocabularyProductionValidations.details,
        createdAt: vocabularyProductionValidations.createdAt,
      })
      .from(vocabularyProductionValidations)
      .where(eq(vocabularyProductionValidations.candidateId, candidateId))
      .orderBy(
        asc(
          sql`case ${vocabularyProductionValidations.stage}
            when 'SCHEMA' then 1
            when 'DECISION_RULE' then 2
            when 'AI_CROSS_VALIDATION' then 3
          end`,
        ),
      );
    const candidate = projectCandidate(row);
    return {
      candidate,
      validations: validations.map((validation) => ({
        candidateOrdinal: candidate.ordinal,
        ...validation,
      })),
    };
  }
}

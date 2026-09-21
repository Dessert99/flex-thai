/** 관리자 어휘 모든 상태 list/detail과 문장·문제 usage를 private field 없이 조회한다 */
import { normalizeThaiSearchText } from '@flex-thia/domain/vocabulary/normalize-thai-search-text';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema as schema } from '../schema/databaseSchema.js';

import {
  expressionOccurrences,
  tokenOccurrences,
} from '../schema/thai-content.schema.js';
import {
  vocabularies,
  vocabularyMeaningRelations,
  vocabularyMeanings,
} from '../schema/vocabulary.schema.js';

type AdminVocabularyDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 관리자 어휘 목록의 공개 필터와 page 입력 */
export interface AdminVocabularyListQuery {
  query?: string;
  kind?: 'WORD' | 'EXPRESSION';
  status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'MERGED';
  page: number;
  pageSize: number;
}

/** 관리자 어휘 목록 한 건의 공개 projection */
export interface AdminVocabularyListItemProjection {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'MERGED';
  mergedIntoVocabularyId: string | null;
  meaningCount: number;
  updatedAt: Date;
}

/** 관리자 어휘 목록 page metadata */
export interface AdminVocabularyPageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** 관리자 어휘 목록 page projection */
export interface AdminVocabularyListProjection {
  items: AdminVocabularyListItemProjection[];
  page: AdminVocabularyPageMetadata;
}

/** 관리자 어휘 뜻 공개 projection */
export interface AdminVocabularyMeaningProjection {
  id: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number | null;
  contextNote: string | null;
}

/** 모든 상태와 distinct version usage를 포함한 관리자 어휘 상세 */
export interface AdminVocabularyDetailProjection {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'MERGED';
  mergedIntoVocabularyId: string | null;
  importanceWeight: number;
  meanings: AdminVocabularyMeaningProjection[];
  relations: Array<{
    id: string;
    sourceMeaningId: string;
    targetMeaningId: string;
    type: 'SYNONYM' | 'ANTONYM' | 'RELATED';
    direction: 'DIRECTED' | 'BIDIRECTIONAL';
    status: 'PENDING' | 'PASSED' | 'FAILED';
    createdAt: Date;
    updatedAt: Date;
  }>;
  usage: {
    sentenceVersionIds: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

/** 저장 graph가 관리자 공개 계약으로 투영될 수 없음을 stable code로 전달한다 */
export class AdminVocabularyQueryError extends Error {
  readonly code = 'ADMIN_VOCABULARY_QUERY_INTEGRITY_ERROR';

  constructor(readonly operation: string) {
    super(`ADMIN_VOCABULARY_QUERY_INTEGRITY_ERROR:${operation}`);
    this.name = 'AdminVocabularyQueryError';
  }
}

const uniqueSortedIds = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

const escapeLikeLiteral = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

const listSelection = {
  id: vocabularies.id,
  thai: vocabularies.thai,
  kind: vocabularies.kind,
  status: vocabularies.status,
  mergedIntoVocabularyId: vocabularies.mergedIntoVocabularyId,
  meaningCount: countDistinct(vocabularyMeanings.id),
  updatedAt: vocabularies.updatedAt,
};

/** 공개 계약에 필요한 모든 상태의 어휘 필드만 조회한다 */
export class DrizzleAdminVocabularyQuery {
  constructor(private readonly database: AdminVocabularyDatabase) {}

  /** normalized Thai 필터와 updatedAt·ID stable page/count를 반환한다 */
  async list(
    query: AdminVocabularyListQuery,
  ): Promise<AdminVocabularyListProjection> {
    const conditions: Array<SQL<unknown> | undefined> = [
      query.query
        ? sql`${vocabularies.normalizedThai} ilike ${`%${escapeLikeLiteral(
            normalizeThaiSearchText(query.query),
          )}%`} escape ${'\\'}`
        : undefined,
      query.kind ? eq(vocabularies.kind, query.kind) : undefined,
      query.status ? eq(vocabularies.status, query.status) : undefined,
    ];
    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(vocabularies)
      .where(and(...conditions));
    const items = await this.database
      .select(listSelection)
      .from(vocabularies)
      .leftJoin(
        vocabularyMeanings,
        eq(vocabularyMeanings.vocabularyId, vocabularies.id),
      )
      .where(and(...conditions))
      .groupBy(
        vocabularies.id,
        vocabularies.thai,
        vocabularies.kind,
        vocabularies.status,
        vocabularies.mergedIntoVocabularyId,
        vocabularies.updatedAt,
      )
      .orderBy(desc(vocabularies.updatedAt), desc(vocabularies.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const totalItems = totalRow?.totalItems ?? 0;
    return {
      items,
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async findById(
    vocabularyId: string,
  ): Promise<AdminVocabularyDetailProjection | null> {
    const [vocabulary] = await this.database
      .select({
        id: vocabularies.id,
        thai: vocabularies.thai,
        kind: vocabularies.kind,
        status: vocabularies.status,
        mergedIntoVocabularyId: vocabularies.mergedIntoVocabularyId,
        importanceWeight: vocabularies.importanceWeight,
        createdAt: vocabularies.createdAt,
        updatedAt: vocabularies.updatedAt,
      })
      .from(vocabularies)
      .where(eq(vocabularies.id, vocabularyId))
      .limit(1);
    if (!vocabulary) return null;

    const meanings = await this.database
      .select({
        id: vocabularyMeanings.id,
        meaningKo: vocabularyMeanings.meaningKo,
        partOfSpeech: vocabularyMeanings.partOfSpeech,
        difficulty: vocabularyMeanings.difficulty,
        contextNote: vocabularyMeanings.contextNote,
      })
      .from(vocabularyMeanings)
      .where(eq(vocabularyMeanings.vocabularyId, vocabularyId))
      .orderBy(asc(vocabularyMeanings.createdAt), asc(vocabularyMeanings.id));
    const tokenSentenceRows = await this.database
      .select({ sentenceVersionId: tokenOccurrences.sentenceVersionId })
      .from(tokenOccurrences)
      .where(eq(tokenOccurrences.vocabularyId, vocabularyId))
      .orderBy(asc(tokenOccurrences.sentenceVersionId));
    const expressionSentenceRows = await this.database
      .select({ sentenceVersionId: expressionOccurrences.sentenceVersionId })
      .from(expressionOccurrences)
      .where(eq(expressionOccurrences.vocabularyId, vocabularyId))
      .orderBy(asc(expressionOccurrences.sentenceVersionId));
    const sentenceVersionIds = uniqueSortedIds([
      ...tokenSentenceRows.map(({ sentenceVersionId }) => sentenceVersionId),
      ...expressionSentenceRows.map(
        ({ sentenceVersionId }) => sentenceVersionId,
      ),
    ]);
    const meaningIds = meanings.map(({ id }) => id);
    const relations =
      meaningIds.length === 0
        ? []
        : await this.database
            .select({
              id: vocabularyMeaningRelations.id,
              sourceMeaningId: vocabularyMeaningRelations.sourceMeaningId,
              targetMeaningId: vocabularyMeaningRelations.targetMeaningId,
              type: vocabularyMeaningRelations.type,
              direction: vocabularyMeaningRelations.direction,
              status: vocabularyMeaningRelations.status,
              createdAt: vocabularyMeaningRelations.createdAt,
              updatedAt: vocabularyMeaningRelations.updatedAt,
            })
            .from(vocabularyMeaningRelations)
            .where(
              or(
                inArray(vocabularyMeaningRelations.sourceMeaningId, meaningIds),
                inArray(vocabularyMeaningRelations.targetMeaningId, meaningIds),
              ),
            )
            .orderBy(asc(vocabularyMeaningRelations.id));

    return {
      ...vocabulary,
      meanings: meanings.map(
        ({ id, meaningKo, partOfSpeech, difficulty, contextNote }) => ({
          id,
          meaningKo,
          partOfSpeech,
          difficulty,
          contextNote,
        }),
      ),
      relations,
      usage: {
        sentenceVersionIds,
      },
    };
  }
}

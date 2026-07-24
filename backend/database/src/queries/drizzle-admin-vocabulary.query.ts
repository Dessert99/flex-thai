/** 관리자 어휘 모든 상태 list/detail과 문장·문제 usage를 private field 없이 조회한다 */
import { normalizeThaiSearchText } from '@flex-thia/domain';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  expressionOccurrences,
  mediaAssets,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questionVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type AdminVocabularyDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 관리자 어휘 목록의 공개 필터와 page 입력 */
export interface AdminVocabularyListQuery {
  query?: string;
  kind?: 'WORD' | 'EXPRESSION';
  status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  page: number;
  pageSize: number;
}

/** 관리자 어휘 목록 한 건의 공개 projection */
export interface AdminVocabularyListItemProjection {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  meaningCount: number;
  pronunciationCount: number;
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

/** storage key 없는 관리자 어휘 발음 projection */
export interface AdminVocabularyPronunciationProjection {
  id: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
  mediaStatus: 'UPLOADING' | 'READY' | 'REJECTED';
}

/** 관리자 어휘 뜻·발음 명시 mapping projection */
export interface AdminVocabularyMeaningPronunciationProjection {
  meaningId: string;
  pronunciationId: string;
}

/** 모든 상태와 distinct version usage를 포함한 관리자 어휘 상세 */
export interface AdminVocabularyDetailProjection {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  meanings: AdminVocabularyMeaningProjection[];
  pronunciations: AdminVocabularyPronunciationProjection[];
  meaningPronunciations: AdminVocabularyMeaningPronunciationProjection[];
  usage: {
    sentenceVersionIds: string[];
    questionVersionIds: string[];
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
  meaningCount: countDistinct(vocabularyMeanings.id),
  pronunciationCount: countDistinct(vocabularyPronunciations.id),
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
      .leftJoin(
        vocabularyPronunciations,
        eq(vocabularyPronunciations.vocabularyId, vocabularies.id),
      )
      .where(and(...conditions))
      .groupBy(
        vocabularies.id,
        vocabularies.thai,
        vocabularies.kind,
        vocabularies.status,
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

  /** 뜻·발음·mapping과 distinct sentence/question version usage만 반환한다 */
  async findById(
    vocabularyId: string,
  ): Promise<AdminVocabularyDetailProjection | null> {
    const [vocabulary] = await this.database
      .select({
        id: vocabularies.id,
        thai: vocabularies.thai,
        kind: vocabularies.kind,
        status: vocabularies.status,
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
    const storedPronunciations = await this.database
      .select({
        id: vocabularyPronunciations.id,
        pronunciationKo: vocabularyPronunciations.pronunciationKo,
        toneMarks: vocabularyPronunciations.toneMarks,
        mediaAssetId: vocabularyPronunciations.mediaAssetId,
        mediaStatus: mediaAssets.status,
      })
      .from(vocabularyPronunciations)
      .leftJoin(
        mediaAssets,
        eq(vocabularyPronunciations.mediaAssetId, mediaAssets.id),
      )
      .where(eq(vocabularyPronunciations.vocabularyId, vocabularyId))
      .orderBy(
        asc(vocabularyPronunciations.createdAt),
        asc(vocabularyPronunciations.id),
      );
    const pronunciations = storedPronunciations.map((row) => {
      if (row.mediaAssetId === null || row.mediaStatus === null) {
        throw new AdminVocabularyQueryError('findById.pronunciationMedia');
      }
      return {
        id: row.id,
        pronunciationKo: row.pronunciationKo,
        toneMarks: row.toneMarks,
        mediaAssetId: row.mediaAssetId,
        mediaStatus: row.mediaStatus,
      };
    });
    const meaningPronunciations = await this.database
      .select({
        meaningId: vocabularyMeaningPronunciations.meaningId,
        pronunciationId: vocabularyMeaningPronunciations.pronunciationId,
      })
      .from(vocabularyMeaningPronunciations)
      .where(eq(vocabularyMeaningPronunciations.vocabularyId, vocabularyId))
      .orderBy(
        asc(vocabularyMeaningPronunciations.meaningId),
        asc(vocabularyMeaningPronunciations.pronunciationId),
      );
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
    const blockQuestionRows = await this.database
      .select({ questionVersionId: questionVersions.id })
      .from(questionVersions)
      .innerJoin(
        questionBlocks,
        eq(questionVersions.id, questionBlocks.questionVersionId),
      )
      .innerJoin(
        questionBlockSentences,
        eq(questionBlocks.id, questionBlockSentences.blockId),
      )
      .where(
        inArray(questionBlockSentences.sentenceVersionId, sentenceVersionIds),
      )
      .orderBy(asc(questionVersions.id));
    const optionQuestionRows = await this.database
      .select({ questionVersionId: questionVersions.id })
      .from(questionVersions)
      .innerJoin(
        questionOptions,
        eq(questionVersions.id, questionOptions.questionVersionId),
      )
      .where(inArray(questionOptions.sentenceVersionId, sentenceVersionIds))
      .orderBy(asc(questionVersions.id));
    const questionVersionIds = uniqueSortedIds([
      ...blockQuestionRows.map(({ questionVersionId }) => questionVersionId),
      ...optionQuestionRows.map(({ questionVersionId }) => questionVersionId),
    ]);

    return {
      ...vocabulary,
      meanings,
      pronunciations,
      meaningPronunciations,
      usage: { sentenceVersionIds, questionVersionIds },
    };
  }
}

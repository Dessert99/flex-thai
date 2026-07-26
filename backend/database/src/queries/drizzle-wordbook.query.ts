/** 사용자 소유 단어장 목록과 검색 가능한 항목 read model을 제공한다 */
import { normalizeThaiSearchText } from '@flex-thia/domain';
import { and, asc, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  mediaAssets,
  vocabularies,
  vocabularyMeanings,
  vocabularyPronunciations,
  wordbookItems,
  wordbooks,
} from '../schema/index.js';
import * as schema from '../schema/index.js';
import {
  type LearnerVocabularyPageMetadata,
  LearnerVocabularyQueryError,
  type LearnerVocabularySummaryProjection,
} from './drizzle-learner-vocabulary.query.js';

type WordbookDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 단어장 항목 목록의 검증 완료 검색 조건 */
export interface WordbookItemListQuery {
  query?: string;
  kind?: 'WORD' | 'EXPRESSION';
  partOfSpeech?: string;
  difficulty?: number;
  page: number;
  pageSize: number;
}

/** 사용자 소유 단어장 목록 projection */
export interface WordbookSummaryProjection {
  id: string;
  name: string;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 단어장에 추가된 시각을 포함한 공용 어휘 projection */
export interface WordbookItemProjection extends LearnerVocabularySummaryProjection {
  addedAt: Date;
}

interface WordbookItemBase {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  addedAt: Date;
}

const compareCreatedAtThenId = (
  left: { id: string; createdAt: Date },
  right: { id: string; createdAt: Date },
): number =>
  left.createdAt.getTime() - right.createdAt.getTime() ||
  left.id.localeCompare(right.id);

const toPageMetadata = (
  query: WordbookItemListQuery,
  totalItems: number,
): LearnerVocabularyPageMetadata => ({
  page: query.page,
  pageSize: query.pageSize,
  totalItems,
  totalPages: Math.ceil(totalItems / query.pageSize),
});

const buildItemFilter = (
  wordbookId: string,
  query: WordbookItemListQuery,
): SQL[] => {
  const conditions: SQL[] = [
    eq(wordbookItems.wordbookId, wordbookId),
    eq(vocabularies.status, 'PUBLISHED'),
  ];
  if (query.kind !== undefined) {
    conditions.push(eq(vocabularies.kind, query.kind));
  }
  if (query.partOfSpeech !== undefined || query.difficulty !== undefined) {
    conditions.push(sql`exists (
      select 1
      from ${vocabularyMeanings}
      where ${vocabularyMeanings.vocabularyId} = ${vocabularies.id}
        and (${query.partOfSpeech ?? null}::text is null
          or ${vocabularyMeanings.partOfSpeech} = ${query.partOfSpeech ?? null})
        and (${query.difficulty ?? null}::integer is null
          or ${vocabularyMeanings.difficulty} = ${query.difficulty ?? null})
    )`);
  }
  if (query.query !== undefined) {
    const normalizedPattern = `%${normalizeThaiSearchText(query.query)}%`;
    const koreanPattern = `%${query.query}%`;
    conditions.push(sql`(
      ${vocabularies.normalizedThai} ilike ${normalizedPattern}
      or exists (
        select 1
        from ${vocabularyMeanings}
        where ${vocabularyMeanings.vocabularyId} = ${vocabularies.id}
          and ${vocabularyMeanings.meaningKo} ilike ${koreanPattern}
      )
      or exists (
        select 1
        from ${vocabularyPronunciations}
        where ${vocabularyPronunciations.vocabularyId} = ${vocabularies.id}
          and ${vocabularyPronunciations.pronunciationKo} ilike ${koreanPattern}
      )
    )`);
  }
  return conditions;
};

const wordbookFields = {
  id: wordbooks.id,
  name: wordbooks.name,
  itemCount: sql<number>`(
    select count(*)::integer
    from ${wordbookItems}
    where ${wordbookItems.wordbookId} = ${wordbooks.id}
  )`,
  createdAt: wordbooks.createdAt,
  updatedAt: wordbooks.updatedAt,
};

/** 단어장 목록과 항목을 중복 없는 ID page로 조회한다 */
export class DrizzleWordbookQuery {
  constructor(private readonly database: WordbookDatabase) {}

  /** 사용자의 빈 단어장까지 생성 순서로 반환한다 */
  listWordbooks(userId: string): Promise<WordbookSummaryProjection[]> {
    return this.database
      .select(wordbookFields)
      .from(wordbooks)
      .where(eq(wordbooks.userId, userId))
      .orderBy(asc(wordbooks.createdAt), asc(wordbooks.id));
  }

  /** 소유 단어장의 게시 항목과 전체 뜻·준비 발음을 반환한다 */
  async listItems(
    userId: string,
    wordbookId: string,
    query: WordbookItemListQuery,
  ): Promise<{
    wordbook: WordbookSummaryProjection;
    items: WordbookItemProjection[];
    page: LearnerVocabularyPageMetadata;
  } | null> {
    const [wordbook] = await this.database
      .select(wordbookFields)
      .from(wordbooks)
      .where(and(eq(wordbooks.userId, userId), eq(wordbooks.id, wordbookId)))
      .limit(1);
    if (!wordbook) return null;

    const conditions = buildItemFilter(wordbookId, query);
    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(vocabularies)
      .innerJoin(wordbookItems, eq(wordbookItems.vocabularyId, vocabularies.id))
      .where(and(...conditions));
    const totalItems = totalRow?.totalItems ?? 0;
    const bases = await this.database
      .select({
        id: vocabularies.id,
        thai: vocabularies.thai,
        kind: vocabularies.kind,
        addedAt: wordbookItems.addedAt,
      })
      .from(vocabularies)
      .innerJoin(wordbookItems, eq(wordbookItems.vocabularyId, vocabularies.id))
      .where(and(...conditions))
      .orderBy(desc(wordbookItems.addedAt), asc(vocabularies.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      wordbook,
      items: await this.loadItems(bases),
      page: toPageMetadata(query, totalItems),
    };
  }

  /** 어휘가 들어 있는 현재 사용자 단어장 ID만 반환한다 */
  async listMemberships(
    userId: string,
    vocabularyId: string,
  ): Promise<string[]> {
    const rows = await this.database
      .select({ wordbookId: wordbookItems.wordbookId })
      .from(wordbookItems)
      .innerJoin(wordbooks, eq(wordbooks.id, wordbookItems.wordbookId))
      .where(
        and(
          eq(wordbooks.userId, userId),
          eq(wordbookItems.vocabularyId, vocabularyId),
        ),
      )
      .orderBy(asc(wordbookItems.wordbookId));
    return rows.map(({ wordbookId }) => wordbookId);
  }

  private async loadItems(
    bases: WordbookItemBase[],
  ): Promise<WordbookItemProjection[]> {
    if (bases.length === 0) return [];
    const vocabularyIds = bases.map(({ id }) => id);
    const meanings = await this.database
      .select({
        id: vocabularyMeanings.id,
        vocabularyId: vocabularyMeanings.vocabularyId,
        meaningKo: vocabularyMeanings.meaningKo,
        partOfSpeech: vocabularyMeanings.partOfSpeech,
        difficulty: vocabularyMeanings.difficulty,
        contextNote: vocabularyMeanings.contextNote,
        createdAt: vocabularyMeanings.createdAt,
      })
      .from(vocabularyMeanings)
      .where(inArray(vocabularyMeanings.vocabularyId, vocabularyIds))
      .orderBy(
        asc(vocabularyMeanings.vocabularyId),
        asc(vocabularyMeanings.createdAt),
        asc(vocabularyMeanings.id),
      );
    const pronunciations = await this.database
      .select({
        id: vocabularyPronunciations.id,
        vocabularyId: vocabularyPronunciations.vocabularyId,
        pronunciationKo: vocabularyPronunciations.pronunciationKo,
        toneMarks: vocabularyPronunciations.toneMarks,
        mediaAssetId: vocabularyPronunciations.mediaAssetId,
        mediaStatus: mediaAssets.status,
        mediaStorageKey: mediaAssets.storageKey,
        createdAt: vocabularyPronunciations.createdAt,
      })
      .from(vocabularyPronunciations)
      .leftJoin(
        mediaAssets,
        eq(mediaAssets.id, vocabularyPronunciations.mediaAssetId),
      )
      .where(inArray(vocabularyPronunciations.vocabularyId, vocabularyIds))
      .orderBy(
        asc(vocabularyPronunciations.vocabularyId),
        asc(vocabularyPronunciations.createdAt),
        asc(vocabularyPronunciations.id),
      );

    return bases.map((base) => {
      const vocabularyPronunciations = pronunciations
        .filter(({ vocabularyId }) => vocabularyId === base.id)
        .sort(compareCreatedAtThenId);
      if (
        vocabularyPronunciations.length === 0 ||
        vocabularyPronunciations.some(
          ({ mediaAssetId, mediaStatus, mediaStorageKey }) =>
            mediaAssetId === null ||
            mediaStatus !== 'READY' ||
            mediaStorageKey === null,
        )
      ) {
        throw new LearnerVocabularyQueryError(
          'PUBLISHED_VOCABULARY_MEDIA_INVALID',
        );
      }
      return {
        id: base.id,
        thai: base.thai,
        kind: base.kind,
        meanings: meanings
          .filter(({ vocabularyId }) => vocabularyId === base.id)
          .sort(compareCreatedAtThenId)
          .map(({ id, meaningKo, partOfSpeech, difficulty, contextNote }) => ({
            id,
            meaningKo,
            partOfSpeech,
            difficulty,
            contextNote,
          })),
        pronunciations: vocabularyPronunciations.map(
          ({ id, pronunciationKo, toneMarks, mediaStorageKey }) => ({
            id,
            pronunciationKo,
            toneMarks,
            media: { storageKey: mediaStorageKey! },
          }),
        ),
        saved: true,
        addedAt: base.addedAt,
      };
    });
  }
}

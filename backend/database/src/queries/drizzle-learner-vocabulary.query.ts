import { DrizzleLearnerQuestionQuery } from './drizzle-learner-question.query.js';
/** 현재 게시 어휘와 현재 공개 문제의 어휘 사용처를 읽는다 */
import { normalizeThaiSearchText } from '@flex-thia/domain/vocabulary/normalize-thai-search-text';
import { and, asc, count, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import { alias, type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema as schema } from '../schema/databaseSchema.js';
import { wordbookItems, wordbooks } from '../schema/learning.schema.js';
import {
  vocabularies,
  vocabularyMeaningRelations,
  vocabularyMeanings,
} from '../schema/vocabulary.schema.js';
import type {
  LearnerQuestionExpressionProjection,
  LearnerQuestionTokenProjection,
} from './thai-sentence-projection.js';

type LearnerVocabularyDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 공용 어휘 종류 */
export type LearnerVocabularyKind = 'WORD' | 'EXPRESSION';

/** database query가 소비하는 검증 완료 어휘 목록 조건 */
export interface LearnerVocabularyListQuery {
  query?: string;
  kind?: LearnerVocabularyKind;
  partOfSpeech?: string;
  difficulty?: number;
  page: number;
  pageSize: number;
}

/** database query가 소비하는 검증 완료 공통 page 조건 */
export interface LearnerVocabularyPageQuery {
  page: number;
  pageSize: number;
}

/** API mapper가 재사용하는 내부 page metadata */
export interface LearnerVocabularyPageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** 공용 어휘의 한국어 뜻 projection */
export interface LearnerVocabularyMeaningProjection {
  id: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number | null;
  contextNote: string | null;
}

/** 공용 어휘의 준비된 발음 projection */
export interface LearnerVocabularyPronunciationProjection {
  id: string;
  pronunciationKo: string;
  toneMarks: string;
}

/** 게시 어휘 목록과 상세가 공유하는 내부 projection */
export interface LearnerVocabularySummaryProjection {
  id: string;
  thai: string;
  kind: LearnerVocabularyKind;
  meanings: LearnerVocabularyMeaningProjection[];
  pronunciations: LearnerVocabularyPronunciationProjection[];
  saved: boolean;
}

/** 어휘 목록의 내부 page projection */
export interface LearnerVocabularyListProjection {
  items: LearnerVocabularySummaryProjection[];
  page: LearnerVocabularyPageMetadata;
}

/** 뜻과 발음의 exact 연결 projection */
export interface LearnerVocabularyMeaningPronunciationProjection {
  meaningId: string;
  pronunciationId: string;
}

/** 현재 게시 문제에서 사용하는 불변 예문 projection */
export interface LearnerVocabularyExampleSentenceProjection {
  sentenceVersionId: string;
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  tokens: LearnerQuestionTokenProjection[];
  expressions: LearnerQuestionExpressionProjection[];
}

/** 공용 어휘 상세의 내부 projection */
export interface LearnerVocabularyDetailProjection extends LearnerVocabularySummaryProjection {
  meaningPronunciations: LearnerVocabularyMeaningPronunciationProjection[];
  exampleSentences: LearnerVocabularyExampleSentenceProjection[];
  relations: Array<{
    id: string;
    type: 'SYNONYM' | 'ANTONYM' | 'RELATED';
    direction: 'DIRECTED' | 'BIDIRECTIONAL';
    meaningId: string;
    relatedVocabularyId: string;
    relatedThai: string;
    relatedMeaningId: string;
    relatedMeaningKo: string;
  }>;
}

/** 관련 문제 summary의 시험 영역 */
export type LearnerVocabularyQuestionSkill = 'READING';

/** 관련 문제 첫 답의 유효 결과 */
export type LearnerVocabularyQuestionFirstResult =
  'CORRECT' | 'INCORRECT' | 'UNANSWERED' | 'UPDATED';

/** 관련 문제 유형의 정답 없는 내부 projection */
export interface LearnerVocabularyQuestionTypeProjection {
  id: string;
  slug: string;
  displayName: string;
}

/** 어휘를 사용하는 현재 게시 문제의 내부 projection */
export interface LearnerVocabularyRelatedQuestionProjection {
  questionId: string;
  questionVersion: number;
  questionType: LearnerVocabularyQuestionTypeProjection;
  skill: LearnerVocabularyQuestionSkill;
  difficulty: number;
  saved: boolean;
  firstResult: LearnerVocabularyQuestionFirstResult;
}

/** 어휘를 사용하는 현재 게시 문제의 내부 page projection */
export interface LearnerVocabularyRelatedQuestionsProjection {
  items: LearnerVocabularyRelatedQuestionProjection[];
  page: LearnerVocabularyPageMetadata;
}

/** 게시 데이터 손상을 조용히 누락하지 않는 stable 내부 query 오류 */
export class LearnerVocabularyQueryError extends Error {
  constructor(readonly code: 'PUBLISHED_VOCABULARY_LINK_INVALID') {
    super(code);
    this.name = 'LearnerVocabularyQueryError';
  }
}

interface VocabularyBaseRow {
  id: string;
  thai: string;
  kind: LearnerVocabularyKind;
  saved: boolean;
}

const toPageMetadata = (
  query: LearnerVocabularyPageQuery,
  totalItems: number,
): LearnerVocabularyPageMetadata => ({
  page: query.page,
  pageSize: query.pageSize,
  totalItems,
  totalPages: Math.ceil(totalItems / query.pageSize),
});

const compareCreatedAtThenId = (
  left: { id: string; createdAt: Date },
  right: { id: string; createdAt: Date },
): number =>
  left.createdAt.getTime() - right.createdAt.getTime() ||
  left.id.localeCompare(right.id);

const buildVocabularyFilter = (query: LearnerVocabularyListQuery): SQL[] => {
  const conditions: SQL[] = [eq(vocabularies.status, 'PUBLISHED')];
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
        from ${vocabularyMeanings}
        where ${vocabularyMeanings.vocabularyId} = ${vocabularies.id}
          and ${vocabularyMeanings.pronunciationKo} ilike ${koreanPattern}
      )
    )`);
  }
  return conditions;
};

const savedInAnyWordbook = (
  userId: string,
): SQL<boolean> => sql<boolean>`exists (
  select 1
  from ${wordbookItems} saved_items
  inner join ${wordbooks} saved_wordbooks
    on saved_wordbooks.id = saved_items.wordbook_id
  where saved_items.vocabulary_id = "vocabularies"."id"
    and saved_wordbooks.user_id = ${userId}
)`;

/** SQL projection을 API mapper용 계층 구조로 조립하는 read-only query */
export class DrizzleLearnerVocabularyQuery {
  constructor(private readonly database: LearnerVocabularyDatabase) {}

  /** 게시 어휘만 검색 조건과 현재 사용자 저장 여부를 계산해 반환한다 */
  async listVocabularies(
    userId: string,
    query: LearnerVocabularyListQuery,
  ): Promise<LearnerVocabularyListProjection> {
    const conditions = buildVocabularyFilter(query);
    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(vocabularies)
      .where(and(...conditions));
    const totalItems = totalRow?.totalItems ?? 0;
    const bases = await this.database
      .select({
        id: vocabularies.id,
        thai: vocabularies.thai,
        kind: vocabularies.kind,
        saved: savedInAnyWordbook(userId),
      })
      .from(vocabularies)
      .where(and(...conditions))
      .orderBy(asc(vocabularies.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      items: await this.loadSummaries(bases),
      page: toPageMetadata(query, totalItems),
    };
  }

  /** 게시 어휘의 exact 뜻·발음 연결과 현재 공개 문제 예문을 반환한다 */
  async getVocabularyDetail(
    userId: string,
    vocabularyId: string,
  ): Promise<LearnerVocabularyDetailProjection | null> {
    const [base] = await this.database
      .select({
        id: vocabularies.id,
        thai: vocabularies.thai,
        kind: vocabularies.kind,
        saved: savedInAnyWordbook(userId),
      })
      .from(vocabularies)
      .where(
        and(
          eq(vocabularies.id, vocabularyId),
          eq(vocabularies.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    if (!base) {
      return null;
    }
    const [summary] = await this.loadSummaries([base]);
    if (!summary) {
      return null;
    }
    const links = summary.meanings.map(({ id }) => ({
      meaningId: id,
      pronunciationId: id,
    }));
    this.assertLinksValid(summary, links);

    const exampleSentences: LearnerVocabularyExampleSentenceProjection[] = [];
    const relations = await this.loadPassedRelations(vocabularyId);
    return {
      ...summary,
      meaningPronunciations: [...links].sort(
        (left, right) =>
          left.meaningId.localeCompare(right.meaningId) ||
          left.pronunciationId.localeCompare(right.pronunciationId),
      ),
      exampleSentences,
      relations,
    };
  }

  /** 현재 게시 문제 중 token 또는 expression으로 어휘를 쓰는 문제를 반환한다 */
  async listRelatedQuestions(
    userId: string,
    vocabularyId: string,
    query: LearnerVocabularyPageQuery,
  ): Promise<LearnerVocabularyRelatedQuestionsProjection> {
    const result = await new DrizzleLearnerQuestionQuery(
      this.database,
    ).listQuestions(userId, { ...query, vocabularyId, sort: 'LATEST' });
    return {
      ...result,
      items: result.items.map(({ majorCategory, topic, tags, ...item }) => {
        void majorCategory;
        void topic;
        void tags;
        return item;
      }),
    };
  }

  private async loadSummaries(
    bases: VocabularyBaseRow[],
  ): Promise<LearnerVocabularySummaryProjection[]> {
    if (bases.length === 0) {
      return [];
    }
    const vocabularyIds = bases.map((base) => base.id);
    const meanings = await this.database
      .select({
        id: vocabularyMeanings.id,
        vocabularyId: vocabularyMeanings.vocabularyId,
        meaningKo: vocabularyMeanings.meaningKo,
        pronunciationKo: vocabularyMeanings.pronunciationKo,
        toneMarks: vocabularyMeanings.toneMarks,
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
    const pronunciations = meanings;

    return bases.map((base) => {
      const vocabularyPronunciationRows = pronunciations
        .filter((pronunciation) => pronunciation.vocabularyId === base.id)
        .sort(compareCreatedAtThenId);
      return {
        id: base.id,
        thai: base.thai,
        kind: base.kind,
        meanings: meanings
          .filter((meaning) => meaning.vocabularyId === base.id)
          .sort(compareCreatedAtThenId)
          .map((meaning) => ({
            id: meaning.id,
            meaningKo: meaning.meaningKo,
            partOfSpeech: meaning.partOfSpeech,
            difficulty: meaning.difficulty,
            contextNote: meaning.contextNote,
          })),
        pronunciations: vocabularyPronunciationRows.map((pronunciation) => ({
          id: pronunciation.id,
          pronunciationKo: pronunciation.pronunciationKo,
          toneMarks: pronunciation.toneMarks,
        })),
        saved: base.saved,
      };
    });
  }

  private assertLinksValid(
    summary: LearnerVocabularySummaryProjection,
    links: LearnerVocabularyMeaningPronunciationProjection[],
  ): void {
    const meaningIds = new Set(summary.meanings.map((meaning) => meaning.id));
    const pronunciationIds = new Set(
      summary.pronunciations.map((pronunciation) => pronunciation.id),
    );
    if (
      links.some(
        (link) =>
          !meaningIds.has(link.meaningId) ||
          !pronunciationIds.has(link.pronunciationId),
      )
    ) {
      throw new LearnerVocabularyQueryError(
        'PUBLISHED_VOCABULARY_LINK_INVALID',
      );
    }
  }

  private async loadPassedRelations(vocabularyId: string) {
    const sourceMeanings = alias(
      vocabularyMeanings,
      'learner_relation_source_meanings',
    );
    const targetMeanings = alias(
      vocabularyMeanings,
      'learner_relation_target_meanings',
    );
    const sourceVocabularies = alias(
      vocabularies,
      'learner_relation_source_vocabularies',
    );
    const targetVocabularies = alias(
      vocabularies,
      'learner_relation_target_vocabularies',
    );
    const rows = await this.database
      .select({
        id: vocabularyMeaningRelations.id,
        type: vocabularyMeaningRelations.type,
        direction: vocabularyMeaningRelations.direction,
        sourceMeaningId: sourceMeanings.id,
        sourceVocabularyId: sourceVocabularies.id,
        sourceThai: sourceVocabularies.thai,
        sourceMeaningKo: sourceMeanings.meaningKo,
        targetMeaningId: targetMeanings.id,
        targetVocabularyId: targetVocabularies.id,
        targetThai: targetVocabularies.thai,
        targetMeaningKo: targetMeanings.meaningKo,
      })
      .from(vocabularyMeaningRelations)
      .innerJoin(
        sourceMeanings,
        eq(vocabularyMeaningRelations.sourceMeaningId, sourceMeanings.id),
      )
      .innerJoin(
        targetMeanings,
        eq(vocabularyMeaningRelations.targetMeaningId, targetMeanings.id),
      )
      .innerJoin(
        sourceVocabularies,
        eq(sourceMeanings.vocabularyId, sourceVocabularies.id),
      )
      .innerJoin(
        targetVocabularies,
        eq(targetMeanings.vocabularyId, targetVocabularies.id),
      )
      .where(
        and(
          eq(vocabularyMeaningRelations.status, 'PASSED'),
          or(
            and(
              eq(sourceVocabularies.id, vocabularyId),
              eq(targetVocabularies.status, 'PUBLISHED'),
            ),
            and(
              eq(vocabularyMeaningRelations.direction, 'BIDIRECTIONAL'),
              eq(targetVocabularies.id, vocabularyId),
              eq(sourceVocabularies.status, 'PUBLISHED'),
            ),
          ),
        ),
      )
      .orderBy(asc(vocabularyMeaningRelations.id));

    return rows.map((row) =>
      row.sourceVocabularyId === vocabularyId
        ? {
            id: row.id,
            type: row.type,
            direction: row.direction,
            meaningId: row.sourceMeaningId,
            relatedVocabularyId: row.targetVocabularyId,
            relatedThai: row.targetThai,
            relatedMeaningId: row.targetMeaningId,
            relatedMeaningKo: row.targetMeaningKo,
          }
        : {
            id: row.id,
            type: row.type,
            direction: row.direction,
            meaningId: row.targetMeaningId,
            relatedVocabularyId: row.sourceVocabularyId,
            relatedThai: row.sourceThai,
            relatedMeaningId: row.sourceMeaningId,
            relatedMeaningKo: row.sourceMeaningKo,
          },
    );
  }
}

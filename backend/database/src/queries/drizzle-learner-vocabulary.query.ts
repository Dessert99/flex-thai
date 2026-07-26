/** 현재 게시 어휘와 현재 공개 문제의 어휘 사용처를 읽는다 */
import { normalizeThaiSearchText } from '@flex-thia/domain';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias, type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  expressionOccurrences,
  mediaAssets,
  questionAttempts,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionTypes,
  questionTypeVersions,
  questionVersions,
  savedQuestions,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
  wordbookItems,
  wordbooks,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

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

/** private media key를 API mapper에만 전달하는 내부 projection */
export interface LearnerVocabularyMediaProjection {
  storageKey: string;
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
  media: LearnerVocabularyMediaProjection;
}

/** 게시 어휘 목록과 저장 목록이 공유하는 내부 projection */
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
  media: LearnerVocabularyMediaProjection;
}

/** 공용 어휘 상세의 내부 projection */
export interface LearnerVocabularyDetailProjection extends LearnerVocabularySummaryProjection {
  meaningPronunciations: LearnerVocabularyMeaningPronunciationProjection[];
  exampleSentences: LearnerVocabularyExampleSentenceProjection[];
}

/** 관련 문제 summary의 시험 영역 */
export type LearnerVocabularyQuestionSkill = 'READING' | 'LISTENING';

/** 관련 문제 첫 답의 유효 결과 */
export type LearnerVocabularyQuestionFirstResult =
  'CORRECT' | 'INCORRECT' | 'UNANSWERED';

/** 관련 문제 유형의 정답 없는 내부 projection */
export interface LearnerVocabularyQuestionTypeProjection {
  id: string;
  slug: string;
  displayName: string;
}

/** 어휘를 사용하는 현재 게시 문제의 내부 projection */
export interface LearnerVocabularyRelatedQuestionProjection {
  questionId: string;
  questionVersionId: string;
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
  constructor(
    readonly code:
      | 'PUBLISHED_VOCABULARY_MEDIA_INVALID'
      | 'PUBLISHED_VOCABULARY_LINK_INVALID'
      | 'PUBLISHED_SENTENCE_MEDIA_INVALID',
  ) {
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
        from ${vocabularyPronunciations}
        where ${vocabularyPronunciations.vocabularyId} = ${vocabularies.id}
          and ${vocabularyPronunciations.pronunciationKo} ilike ${koreanPattern}
      )
    )`);
  }
  return conditions;
};

const savedInAnyWordbook = (userId: string): SQL<boolean> => sql<boolean>`exists (
  select 1
  from ${wordbookItems}
  inner join ${wordbooks}
    on ${wordbooks.id} = ${wordbookItems.wordbookId}
  where ${wordbookItems.vocabularyId} = ${vocabularies.id}
    and ${wordbooks.userId} = ${userId}
)`;

const currentQuestionUsesSentence = (): SQL => sql`(
  exists (
    select 1
    from ${questionBlockSentences}
    inner join ${questionBlocks}
      on ${questionBlocks.id} = ${questionBlockSentences.blockId}
    inner join ${questionVersions}
      on ${questionVersions.id} = ${questionBlocks.questionVersionId}
    inner join ${questions}
      on ${questions.id} = ${questionVersions.questionId}
      and ${questions.currentPublishedVersionId} = ${questionVersions.id}
    where ${questionBlockSentences.sentenceVersionId} = ${thaiSentenceVersions.id}
      and ${questions.status} = ${'PUBLISHED'}
      and ${questionVersions.status} = ${'PUBLISHED'}
  )
  or exists (
    select 1
    from ${questionOptions}
    inner join ${questionVersions}
      on ${questionVersions.id} = ${questionOptions.questionVersionId}
    inner join ${questions}
      on ${questions.id} = ${questionVersions.questionId}
      and ${questions.currentPublishedVersionId} = ${questionVersions.id}
    where ${questionOptions.sentenceVersionId} = ${thaiSentenceVersions.id}
      and ${questions.status} = ${'PUBLISHED'}
      and ${questionVersions.status} = ${'PUBLISHED'}
  )
)`;

const sentenceUsesVocabulary = (vocabularyId: string): SQL => sql`(
  exists (
    select 1
    from ${tokenOccurrences}
    where ${tokenOccurrences.sentenceVersionId} = ${thaiSentenceVersions.id}
      and ${tokenOccurrences.vocabularyId} = ${vocabularyId}
  )
  or exists (
    select 1
    from ${expressionOccurrences}
    where ${expressionOccurrences.sentenceVersionId} = ${thaiSentenceVersions.id}
      and ${expressionOccurrences.vocabularyId} = ${vocabularyId}
  )
)`;

const questionVersionUsesVocabulary = (vocabularyId: string): SQL => sql`(
  exists (
    select 1
    from ${questionBlockSentences}
    inner join ${questionBlocks}
      on ${questionBlocks.id} = ${questionBlockSentences.blockId}
    where ${questionBlocks.questionVersionId} = ${questionVersions.id}
      and (
        exists (
          select 1
          from ${tokenOccurrences}
          where ${tokenOccurrences.sentenceVersionId} =
            ${questionBlockSentences.sentenceVersionId}
            and ${tokenOccurrences.vocabularyId} = ${vocabularyId}
        )
        or exists (
          select 1
          from ${expressionOccurrences}
          where ${expressionOccurrences.sentenceVersionId} =
            ${questionBlockSentences.sentenceVersionId}
            and ${expressionOccurrences.vocabularyId} = ${vocabularyId}
        )
      )
  )
  or exists (
    select 1
    from ${questionOptions}
    where ${questionOptions.questionVersionId} = ${questionVersions.id}
      and (
        exists (
          select 1
          from ${tokenOccurrences}
          where ${tokenOccurrences.sentenceVersionId} =
            ${questionOptions.sentenceVersionId}
            and ${tokenOccurrences.vocabularyId} = ${vocabularyId}
        )
        or exists (
          select 1
          from ${expressionOccurrences}
          where ${expressionOccurrences.sentenceVersionId} =
            ${questionOptions.sentenceVersionId}
            and ${expressionOccurrences.vocabularyId} = ${vocabularyId}
        )
      )
  )
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
    const links = await this.database
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
    this.assertLinksValid(summary, links);

    return {
      ...summary,
      meaningPronunciations: [...links].sort(
        (left, right) =>
          left.meaningId.localeCompare(right.meaningId) ||
          left.pronunciationId.localeCompare(right.pronunciationId),
      ),
      exampleSentences: await this.loadExampleSentences(vocabularyId),
    };
  }

  /** 현재 게시 문제 중 token 또는 expression으로 어휘를 쓰는 문제를 반환한다 */
  async listRelatedQuestions(
    userId: string,
    vocabularyId: string,
    query: LearnerVocabularyPageQuery,
  ): Promise<LearnerVocabularyRelatedQuestionsProjection> {
    const firstAttempts = alias(questionAttempts, 'vocabulary_first_attempts');
    const firstAttemptVersions = alias(
      questionVersions,
      'vocabulary_first_attempt_versions',
    );
    const firstResult = sql<LearnerVocabularyQuestionFirstResult>`case
      when ${firstAttempts.id} is null
        or ${firstAttemptVersions.status} = ${'INVALIDATED'}
        then 'UNANSWERED'
      when ${firstAttempts.isCorrect} then 'CORRECT'
      else 'INCORRECT'
    end`;
    const saved = sql<boolean>`${savedQuestions.questionId} is not null`;
    const conditions = and(
      eq(questions.status, 'PUBLISHED'),
      eq(questionVersions.status, 'PUBLISHED'),
      sql`exists (
        select 1
        from ${vocabularies}
        where ${vocabularies.id} = ${vocabularyId}
          and ${vocabularies.status} = ${'PUBLISHED'}
      )`,
      questionVersionUsesVocabulary(vocabularyId),
    );
    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, questions.id),
          eq(questionVersions.id, questions.currentPublishedVersionId),
        ),
      )
      .innerJoin(
        questionTypeVersions,
        eq(questionVersions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .leftJoin(
        savedQuestions,
        and(
          eq(savedQuestions.questionId, questions.id),
          eq(savedQuestions.userId, userId),
        ),
      )
      .leftJoin(
        firstAttempts,
        and(
          eq(firstAttempts.userId, userId),
          eq(firstAttempts.questionId, questions.id),
          eq(firstAttempts.attemptNo, 1),
        ),
      )
      .leftJoin(
        firstAttemptVersions,
        and(
          eq(firstAttemptVersions.questionId, firstAttempts.questionId),
          eq(firstAttemptVersions.id, firstAttempts.questionVersionId),
        ),
      )
      .where(conditions);
    const totalItems = totalRow?.totalItems ?? 0;
    const rows = await this.database
      .select({
        questionId: questions.id,
        questionVersionId: questionVersions.id,
        questionTypeId: questionTypes.id,
        questionTypeSlug: questionTypes.slug,
        questionTypeDisplayName: questionTypes.displayName,
        skill: questionTypes.skill,
        difficulty: questionVersions.difficulty,
        saved,
        firstResult,
      })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, questions.id),
          eq(questionVersions.id, questions.currentPublishedVersionId),
        ),
      )
      .innerJoin(
        questionTypeVersions,
        eq(questionVersions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .leftJoin(
        savedQuestions,
        and(
          eq(savedQuestions.questionId, questions.id),
          eq(savedQuestions.userId, userId),
        ),
      )
      .leftJoin(
        firstAttempts,
        and(
          eq(firstAttempts.userId, userId),
          eq(firstAttempts.questionId, questions.id),
          eq(firstAttempts.attemptNo, 1),
        ),
      )
      .leftJoin(
        firstAttemptVersions,
        and(
          eq(firstAttemptVersions.questionId, firstAttempts.questionId),
          eq(firstAttemptVersions.id, firstAttempts.questionVersionId),
        ),
      )
      .where(conditions)
      .orderBy(asc(questions.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      items: rows.map((row) => ({
        questionId: row.questionId,
        questionVersionId: row.questionVersionId,
        questionType: {
          id: row.questionTypeId,
          slug: row.questionTypeSlug,
          displayName: row.questionTypeDisplayName,
        },
        skill: row.skill,
        difficulty: row.difficulty,
        saved: row.saved,
        firstResult: row.firstResult,
      })),
      page: toPageMetadata(query, totalItems),
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
      const vocabularyPronunciationRows = pronunciations
        .filter((pronunciation) => pronunciation.vocabularyId === base.id)
        .sort(compareCreatedAtThenId);
      if (
        vocabularyPronunciationRows.length === 0 ||
        vocabularyPronunciationRows.some(
          (pronunciation) =>
            pronunciation.mediaAssetId === null ||
            pronunciation.mediaStatus !== 'READY' ||
            pronunciation.mediaStorageKey === null,
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
          media: { storageKey: pronunciation.mediaStorageKey! },
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

  private async loadExampleSentences(
    vocabularyId: string,
  ): Promise<LearnerVocabularyExampleSentenceProjection[]> {
    const rows = await this.database
      .select({
        sentenceVersionId: thaiSentenceVersions.id,
        originalText: thaiSentenceVersions.originalText,
        translationKo: thaiSentenceVersions.translationKo,
        pronunciationKo: thaiSentenceVersions.pronunciationKo,
        toneMarks: thaiSentenceVersions.toneMarks,
        frozenAt: thaiSentenceVersions.frozenAt,
        mediaAssetId: thaiSentenceVersions.mediaAssetId,
        mediaStatus: mediaAssets.status,
        mediaStorageKey: mediaAssets.storageKey,
      })
      .from(thaiSentenceVersions)
      .leftJoin(
        mediaAssets,
        eq(mediaAssets.id, thaiSentenceVersions.mediaAssetId),
      )
      .where(
        and(
          isNotNull(thaiSentenceVersions.frozenAt),
          sentenceUsesVocabulary(vocabularyId),
          currentQuestionUsesSentence(),
        ),
      )
      .orderBy(asc(thaiSentenceVersions.id));
    if (
      rows.some(
        (row) =>
          row.frozenAt === null ||
          row.mediaAssetId === null ||
          row.mediaStatus !== 'READY' ||
          row.mediaStorageKey === null,
      )
    ) {
      throw new LearnerVocabularyQueryError('PUBLISHED_SENTENCE_MEDIA_INVALID');
    }
    return [...rows]
      .sort((left, right) =>
        left.sentenceVersionId.localeCompare(right.sentenceVersionId),
      )
      .map((row) => ({
        sentenceVersionId: row.sentenceVersionId,
        originalText: row.originalText,
        translationKo: row.translationKo,
        pronunciationKo: row.pronunciationKo,
        toneMarks: row.toneMarks,
        media: { storageKey: row.mediaStorageKey! },
      }));
  }
}

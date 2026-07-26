/** 현재 게시된 개념과 상호작용 태국어 예시를 조회한다 */
import { and, asc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import { alias, type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  conceptBlockExamples,
  conceptBlocks,
  concepts,
  conceptVersions,
} from '../schema/concepts.schema.js';
import { mediaAssets } from '../schema/media.schema.js';
import {
  expressionOccurrences,
  thaiSentenceVersions,
  tokenOccurrences,
} from '../schema/thai-content.schema.js';
import { vocabularyPronunciations } from '../schema/vocabulary.schema.js';

const conceptQuerySchema = {
  conceptBlockExamples,
  conceptBlocks,
  concepts,
  conceptVersions,
  expressionOccurrences,
  mediaAssets,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularyPronunciations,
};
type LearnerConceptDatabase = PgDatabase<
  PgQueryResultHKT,
  typeof conceptQuerySchema
>;

export type LearnerConceptCategory = 'THAI_SCRIPT_PRONUNCIATION' | 'GRAMMAR';

/** 게시 graph 훼손을 부분 응답 대신 fail-closed 오류로 전달한다 */
export class LearnerConceptQueryError extends Error {
  readonly code = 'PUBLISHED_CONCEPT_GRAPH_INVALID';

  constructor(readonly operation: string) {
    super(`PUBLISHED_CONCEPT_GRAPH_INVALID:${operation}`);
    this.name = 'LearnerConceptQueryError';
  }
}

/** private media key projection */
export interface ConceptMediaProjection {
  storageKey: string;
}

/** 개념 예시의 단어 피드백 projection */
export interface ConceptTokenProjection {
  position: number;
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  media: ConceptMediaProjection;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING' | 'INSTRUCTION';
}

/** 개념 예시의 표현 피드백 projection */
export interface ConceptExpressionProjection {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  media: ConceptMediaProjection;
  representative: boolean;
}

/** 개념 예시의 내부 태국어 문장 projection */
export interface ConceptSentenceProjection {
  sentenceVersionId: string;
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  media: ConceptMediaProjection;
  tokens: ConceptTokenProjection[];
  expressions: ConceptExpressionProjection[];
}

/** 학습자 개념 목록 항목 */
export interface LearnerConceptListRow {
  id: string;
  category: LearnerConceptCategory;
  position: number;
  title: string;
  summary: string;
}

interface LearnerConceptBase extends LearnerConceptListRow {
  versionId: string;
}

interface LearnerConceptBlockRow {
  id: string;
  kind: 'EXPLANATION' | 'RULE_TABLE' | 'THAI_EXAMPLES';
  position: number;
  heading: string;
  paragraphs: string[] | null;
  tableHeaders: string[] | null;
  tableRows: string[][] | null;
}

/** 학습자 개념 상세 블록 */
export type LearnerConceptBlockProjection =
  | {
      id: string;
      kind: 'EXPLANATION';
      position: number;
      heading: string;
      paragraphs: string[];
    }
  | {
      id: string;
      kind: 'RULE_TABLE';
      position: number;
      heading: string;
      headers: string[];
      rows: string[][];
    }
  | {
      id: string;
      kind: 'THAI_EXAMPLES';
      position: number;
      heading: string;
      examples: Array<{
        position: number;
        noteKo: string | null;
        sentence: ConceptSentenceProjection;
      }>;
    };

/** 학습자 개념 상세 projection */
export interface LearnerConceptDetailRow extends LearnerConceptBase {
  tableOfContents: Array<{
    blockId: string;
    heading: string;
    position: number;
  }>;
  blocks: LearnerConceptBlockProjection[];
}

interface LearnerExampleRow {
  blockId: string;
  position: number;
  noteKo: string | null;
  sentence: ConceptSentenceProjection;
}

const byPosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

/** logical/current 게시 상태와 선택적 영역을 함께 고정한다 */
export const publishedConceptCondition = (
  conceptIdOrCategory:
    { conceptId: string } | { category: LearnerConceptCategory },
): SQL =>
  and(
    eq(concepts.status, 'PUBLISHED'),
    eq(conceptVersions.status, 'PUBLISHED'),
    'conceptId' in conceptIdOrCategory
      ? eq(concepts.id, conceptIdOrCategory.conceptId)
      : eq(conceptVersions.category, conceptIdOrCategory.category),
  )!;

/** READY join 결과가 원본 graph 개수와 같지 않으면 전체 상세을 실패시킨다 */
export const assertCompleteConceptGraph = (counts: {
  exampleReferences: number;
  readySentences: number;
  tokenOccurrences: number;
  readyTokens: number;
  expressionOccurrences: number;
  readyExpressions: number;
}): void => {
  if (counts.exampleReferences !== counts.readySentences) {
    throw new LearnerConceptQueryError('sentenceGraph');
  }
  if (
    counts.tokenOccurrences !== counts.readyTokens ||
    counts.expressionOccurrences !== counts.readyExpressions
  ) {
    throw new LearnerConceptQueryError('feedbackGraph');
  }
};

/** 공개 개념 flat rows를 정렬된 상세와 목차로 조립한다 */
export const assembleLearnerConceptDetail = (
  concept: LearnerConceptBase,
  blockRows: LearnerConceptBlockRow[],
  exampleRows: LearnerExampleRow[],
): LearnerConceptDetailRow => {
  const sortedBlocks = [...blockRows].sort(byPosition);
  return {
    ...concept,
    tableOfContents: sortedBlocks.map((block) => ({
      blockId: block.id,
      heading: block.heading,
      position: block.position,
    })),
    blocks: sortedBlocks.map((block): LearnerConceptBlockProjection => {
      if (block.kind === 'EXPLANATION') {
        return {
          id: block.id,
          kind: block.kind,
          position: block.position,
          heading: block.heading,
          paragraphs: block.paragraphs ?? [],
        };
      }
      if (block.kind === 'RULE_TABLE') {
        return {
          id: block.id,
          kind: block.kind,
          position: block.position,
          heading: block.heading,
          headers: block.tableHeaders ?? [],
          rows: block.tableRows ?? [],
        };
      }
      return {
        id: block.id,
        kind: block.kind,
        position: block.position,
        heading: block.heading,
        examples: exampleRows
          .filter(({ blockId }) => blockId === block.id)
          .sort(byPosition)
          .map(({ blockId: _blockId, ...example }) => example),
      };
    }),
  };
};

/** 학습자 공개 개념 query */
export class DrizzleLearnerConceptQuery {
  constructor(private readonly database: LearnerConceptDatabase) {}

  /** 영역별 현재 게시 개념 카드를 안정적으로 정렬한다 */
  list(category: LearnerConceptCategory): Promise<LearnerConceptListRow[]> {
    return this.database
      .select({
        id: concepts.id,
        category: conceptVersions.category,
        position: conceptVersions.position,
        title: conceptVersions.title,
        summary: conceptVersions.summary,
      })
      .from(concepts)
      .innerJoin(
        conceptVersions,
        eq(concepts.currentPublishedVersionId, conceptVersions.id),
      )
      .where(publishedConceptCondition({ category }))
      .orderBy(
        asc(conceptVersions.position),
        asc(conceptVersions.title),
        asc(concepts.id),
      );
  }

  /** 현재 게시 버전의 블록과 태국어 피드백 graph를 조회한다 */
  async findPublishedDetail(
    conceptId: string,
  ): Promise<LearnerConceptDetailRow | null> {
    const [concept] = await this.database
      .select({
        id: concepts.id,
        versionId: conceptVersions.id,
        category: conceptVersions.category,
        position: conceptVersions.position,
        title: conceptVersions.title,
        summary: conceptVersions.summary,
      })
      .from(concepts)
      .innerJoin(
        conceptVersions,
        eq(concepts.currentPublishedVersionId, conceptVersions.id),
      )
      .where(publishedConceptCondition({ conceptId }))
      .limit(1);
    if (!concept) return null;
    const blocks = await this.database
      .select({
        id: conceptBlocks.id,
        kind: conceptBlocks.kind,
        position: conceptBlocks.position,
        heading: conceptBlocks.heading,
        paragraphs: conceptBlocks.paragraphs,
        tableHeaders: conceptBlocks.tableHeaders,
        tableRows: conceptBlocks.tableRows,
      })
      .from(conceptBlocks)
      .where(eq(conceptBlocks.conceptVersionId, concept.versionId))
      .orderBy(asc(conceptBlocks.position));
    const sentenceMedia = alias(mediaAssets, 'concept_sentence_media');
    const referenceRows = await this.database
      .select({ id: conceptBlockExamples.id })
      .from(conceptBlockExamples)
      .innerJoin(
        conceptBlocks,
        eq(conceptBlockExamples.blockId, conceptBlocks.id),
      )
      .where(eq(conceptBlocks.conceptVersionId, concept.versionId));
    const sentenceRows = await this.database
      .select({
        blockId: conceptBlockExamples.blockId,
        position: conceptBlockExamples.position,
        noteKo: conceptBlockExamples.noteKo,
        sentenceVersionId: thaiSentenceVersions.id,
        originalText: thaiSentenceVersions.originalText,
        translationKo: thaiSentenceVersions.translationKo,
        pronunciationKo: thaiSentenceVersions.pronunciationKo,
        toneMarks: thaiSentenceVersions.toneMarks,
        storageKey: sentenceMedia.storageKey,
      })
      .from(conceptBlockExamples)
      .innerJoin(
        conceptBlocks,
        eq(conceptBlockExamples.blockId, conceptBlocks.id),
      )
      .innerJoin(
        thaiSentenceVersions,
        and(
          eq(conceptBlockExamples.sentenceVersionId, thaiSentenceVersions.id),
          isNotNull(thaiSentenceVersions.frozenAt),
        ),
      )
      .innerJoin(
        sentenceMedia,
        and(
          eq(thaiSentenceVersions.mediaAssetId, sentenceMedia.id),
          eq(sentenceMedia.status, 'READY'),
        ),
      )
      .where(eq(conceptBlocks.conceptVersionId, concept.versionId))
      .orderBy(asc(conceptBlocks.position), asc(conceptBlockExamples.position));
    const sentenceIds = sentenceRows.map(
      ({ sentenceVersionId }) => sentenceVersionId,
    );
    const pronunciationMedia = alias(
      mediaAssets,
      'concept_pronunciation_media',
    );
    const tokenRows =
      sentenceIds.length === 0
        ? []
        : await this.database
            .select({
              sentenceVersionId: tokenOccurrences.sentenceVersionId,
              position: tokenOccurrences.position,
              surface: tokenOccurrences.surface,
              startOffset: tokenOccurrences.startOffset,
              endOffset: tokenOccurrences.endOffset,
              vocabularyId: tokenOccurrences.vocabularyId,
              meaningId: tokenOccurrences.meaningId,
              pronunciationId: tokenOccurrences.pronunciationId,
              contextMeaningKo: tokenOccurrences.contextMeaningKo,
              pronunciationKo: vocabularyPronunciations.pronunciationKo,
              toneMarks: vocabularyPronunciations.toneMarks,
              storageKey: pronunciationMedia.storageKey,
              role: tokenOccurrences.role,
            })
            .from(tokenOccurrences)
            .innerJoin(
              vocabularyPronunciations,
              eq(tokenOccurrences.pronunciationId, vocabularyPronunciations.id),
            )
            .innerJoin(
              pronunciationMedia,
              and(
                eq(
                  vocabularyPronunciations.mediaAssetId,
                  pronunciationMedia.id,
                ),
                eq(pronunciationMedia.status, 'READY'),
              ),
            )
            .where(inArray(tokenOccurrences.sentenceVersionId, sentenceIds))
            .orderBy(
              asc(tokenOccurrences.sentenceVersionId),
              asc(tokenOccurrences.position),
            );
    const expressionRows =
      sentenceIds.length === 0
        ? []
        : await this.database
            .select({
              sentenceVersionId: expressionOccurrences.sentenceVersionId,
              startTokenIndex: expressionOccurrences.startTokenIndex,
              endTokenIndex: expressionOccurrences.endTokenIndex,
              vocabularyId: expressionOccurrences.vocabularyId,
              meaningId: expressionOccurrences.meaningId,
              pronunciationId: expressionOccurrences.pronunciationId,
              contextMeaningKo: expressionOccurrences.contextMeaningKo,
              pronunciationKo: vocabularyPronunciations.pronunciationKo,
              toneMarks: vocabularyPronunciations.toneMarks,
              storageKey: pronunciationMedia.storageKey,
              representative: expressionOccurrences.representative,
            })
            .from(expressionOccurrences)
            .innerJoin(
              vocabularyPronunciations,
              eq(
                expressionOccurrences.pronunciationId,
                vocabularyPronunciations.id,
              ),
            )
            .innerJoin(
              pronunciationMedia,
              and(
                eq(
                  vocabularyPronunciations.mediaAssetId,
                  pronunciationMedia.id,
                ),
                eq(pronunciationMedia.status, 'READY'),
              ),
            )
            .where(
              inArray(expressionOccurrences.sentenceVersionId, sentenceIds),
            )
            .orderBy(
              asc(expressionOccurrences.sentenceVersionId),
              asc(expressionOccurrences.startTokenIndex),
            );
    const rawTokenRows =
      sentenceIds.length === 0
        ? []
        : await this.database
            .select({ id: tokenOccurrences.id })
            .from(tokenOccurrences)
            .where(inArray(tokenOccurrences.sentenceVersionId, sentenceIds));
    const rawExpressionRows =
      sentenceIds.length === 0
        ? []
        : await this.database
            .select({ id: expressionOccurrences.id })
            .from(expressionOccurrences)
            .where(
              inArray(expressionOccurrences.sentenceVersionId, sentenceIds),
            );
    assertCompleteConceptGraph({
      exampleReferences: referenceRows.length,
      readySentences: sentenceRows.length,
      tokenOccurrences: rawTokenRows.length,
      readyTokens: tokenRows.length,
      expressionOccurrences: rawExpressionRows.length,
      readyExpressions: expressionRows.length,
    });
    const examples: LearnerExampleRow[] = sentenceRows.map((row) => ({
      blockId: row.blockId,
      position: row.position,
      noteKo: row.noteKo,
      sentence: {
        sentenceVersionId: row.sentenceVersionId,
        originalText: row.originalText,
        translationKo: row.translationKo,
        pronunciationKo: row.pronunciationKo,
        toneMarks: row.toneMarks,
        media: { storageKey: row.storageKey },
        tokens: tokenRows
          .filter(
            ({ sentenceVersionId }) =>
              sentenceVersionId === row.sentenceVersionId,
          )
          .map(({ sentenceVersionId: _id, storageKey, ...token }) => ({
            ...token,
            media: { storageKey },
          })),
        expressions: expressionRows
          .filter(
            ({ sentenceVersionId }) =>
              sentenceVersionId === row.sentenceVersionId,
          )
          .map(({ sentenceVersionId: _id, storageKey, ...expression }) => ({
            ...expression,
            media: { storageKey },
          })),
      },
    }));
    return assembleLearnerConceptDetail(concept, blocks, examples);
  }
}

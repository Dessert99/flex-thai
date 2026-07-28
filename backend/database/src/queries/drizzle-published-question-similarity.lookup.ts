/** 현재 게시 문제 문장 graph와 생성 후보의 결정적 유사도를 조회한다 */
import {
  normalizeThaiSearchText,
  type GeneratedQuestionCandidate,
  type QuestionSimilarityLookup,
  type QuestionSimilarityMatch,
} from '@flex-thia/domain';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionVersions,
  thaiSentenceVersions,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type PublishedQuestionSimilarityDatabase = Pick<
  PgDatabase<PgQueryResultHKT, typeof schema>,
  'execute'
>;

interface PublishedQuestionSentenceRow {
  questionVersionId: string;
  originalText: string;
}

const rowsOf = <Row>(result: unknown): Row[] => {
  if (Array.isArray(result)) return result as Row[];
  if (
    typeof result === 'object' &&
    result !== null &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as Row[];
  }
  return [];
};

const candidateSentences = (
  candidate: GeneratedQuestionCandidate,
): string[] => [
  ...candidate.payload.blocks.flatMap((block) =>
    block.sentences.map(({ sentence }) => sentence.originalText),
  ),
  ...candidate.payload.options.flatMap((option) =>
    option.sentence === null ? [] : [option.sentence.originalText],
  ),
];

const uniqueNormalized = (values: string[]): string[] => [
  ...new Set(values.map(normalizeThaiSearchText).filter(Boolean)),
];

const scoreMatches = (
  candidate: GeneratedQuestionCandidate,
  rows: PublishedQuestionSentenceRow[],
  limit: number,
): QuestionSimilarityMatch[] => {
  const source = uniqueNormalized(candidateSentences(candidate));
  const sourceSet = new Set(source);
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    const normalized = normalizeThaiSearchText(row.originalText);
    if (!normalized) continue;
    const sentences = grouped.get(row.questionVersionId) ?? new Set<string>();
    sentences.add(normalized);
    grouped.set(row.questionVersionId, sentences);
  }

  return [...grouped]
    .flatMap(([questionVersionId, sentences]) => {
      const intersection = source.filter((value) => sentences.has(value));
      if (intersection.length === 0) return [];
      const unionSize = new Set([...sourceSet, ...sentences]).size;
      return [
        {
          questionVersionId,
          score: intersection.length / unionSize,
          summary: intersection.join(' | '),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.questionVersionId.localeCompare(right.questionVersionId),
    )
    .slice(0, limit);
};

/** 현재 공개된 문제 버전의 블록·선택지 문장만 비교 대상으로 제한한다 */
export class DrizzlePublishedQuestionSimilarityLookup implements QuestionSimilarityLookup {
  constructor(private readonly database: PublishedQuestionSimilarityDatabase) {}

  /** 정규화 문장 집합의 Jaccard 점수로 최대 다섯 건을 안정 순서로 반환한다 */
  async findSimilar(
    candidate: GeneratedQuestionCandidate,
    limit: 5,
  ): Promise<QuestionSimilarityMatch[]> {
    if (limit !== 5) {
      throw new Error('QUESTION_SIMILARITY_LIMIT_INVALID');
    }
    const result = await this.database.execute(sql`
      with published_sentence_refs as (
        select
          ${questionVersions.id} as question_version_id,
          ${questionBlockSentences.sentenceVersionId} as sentence_version_id
        from ${questions}
        inner join ${questionVersions}
          on ${questionVersions.questionId} = ${questions.id}
          and ${questionVersions.id} = ${questions.currentPublishedVersionId}
        inner join ${questionBlocks}
          on ${questionBlocks.questionVersionId} = ${questionVersions.id}
        inner join ${questionBlockSentences}
          on ${questionBlockSentences.blockId} = ${questionBlocks.id}
        where ${questions.status} = ${'PUBLISHED'}
          and ${questionVersions.status} = ${'PUBLISHED'}
        union
        select
          ${questionVersions.id} as question_version_id,
          coalesce(
            ${questionOptions.sentenceVersionId},
            ${questionOptions.spanSentenceVersionId}
          ) as sentence_version_id
        from ${questions}
        inner join ${questionVersions}
          on ${questionVersions.questionId} = ${questions.id}
          and ${questionVersions.id} = ${questions.currentPublishedVersionId}
        inner join ${questionOptions}
          on ${questionOptions.questionVersionId} = ${questionVersions.id}
        where ${questions.status} = ${'PUBLISHED'}
          and ${questionVersions.status} = ${'PUBLISHED'}
      )
      select
        published_sentence_refs.question_version_id as "questionVersionId",
        ${thaiSentenceVersions.originalText} as "originalText"
      from published_sentence_refs
      inner join ${thaiSentenceVersions}
        on ${thaiSentenceVersions.id} = published_sentence_refs.sentence_version_id
      order by published_sentence_refs.question_version_id, ${thaiSentenceVersions.id}
    `);
    return scoreMatches(
      candidate,
      rowsOf<PublishedQuestionSentenceRow>(result),
      limit,
    );
  }
}

/** AI 어휘 제작용 exact·의심 중복 조회를 Drizzle로 구현한다 */
import { eq, inArray } from 'drizzle-orm';
import type {
  VocabularyProductionLookup,
  VocabularyProductionSuspect,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  vocabularies,
  vocabularyMeanings,
} from '../schema/vocabulary.schema.js';

type VocabularyProductionDatabase = PgDatabase<PgQueryResultHKT>;

const codePointDistance = (left: string, right: string): number => {
  const leftPoints = [...left];
  const rightPoints = [...right];
  let previous = Array.from(
    { length: rightPoints.length + 1 },
    (_, index) => index,
  );

  for (const [leftIndex, leftPoint] of leftPoints.entries()) {
    const current = [leftIndex + 1];

    for (const [rightIndex, rightPoint] of rightPoints.entries()) {
      current.push(
        Math.min(
          current[rightIndex]! + 1,
          previous[rightIndex + 1]! + 1,
          previous[rightIndex]! + (leftPoint === rightPoint ? 0 : 1),
        ),
      );
    }

    previous = current;
  }

  return previous[rightPoints.length] ?? leftPoints.length;
};

/** active와 MERGED 대표를 따라 AI 제작 중복 판정 자료를 반환한다 */
export class DrizzleVocabularyProductionLookup implements VocabularyProductionLookup {
  constructor(private readonly database: VocabularyProductionDatabase) {}

  /** normalized exact가 MERGED면 최종 대표의 뜻을 반환한다 */
  async findExact(
    normalizedThai: string,
  ): ReturnType<VocabularyProductionLookup['findExact']> {
    const [initial] = await this.database
      .select({
        id: vocabularies.id,
        status: vocabularies.status,
        mergedIntoVocabularyId: vocabularies.mergedIntoVocabularyId,
      })
      .from(vocabularies)
      .where(eq(vocabularies.normalizedThai, normalizedThai))
      .limit(1);

    if (!initial) {
      return null;
    }

    let current = initial;
    const visited = new Set<string>();

    while (current.status === 'MERGED') {
      if (!current.mergedIntoVocabularyId || visited.has(current.id)) {
        throw new Error(`유효하지 않은 어휘 병합 chain입니다: ${initial.id}`);
      }
      visited.add(current.id);
      const [representative] = await this.database
        .select({
          id: vocabularies.id,
          status: vocabularies.status,
          mergedIntoVocabularyId: vocabularies.mergedIntoVocabularyId,
        })
        .from(vocabularies)
        .where(eq(vocabularies.id, current.mergedIntoVocabularyId))
        .limit(1);

      if (!representative) {
        throw new Error(`대표 어휘를 찾을 수 없습니다: ${initial.id}`);
      }
      current = representative;
    }

    const meanings = await this.database
      .select({ meaningKo: vocabularyMeanings.meaningKo })
      .from(vocabularyMeanings)
      .where(eq(vocabularyMeanings.vocabularyId, current.id));
    return { vocabularyId: current.id, meanings };
  }

  /** active 어휘의 Unicode code-point 거리를 계산해 stable 상위 후보만 반환한다 */
  async findSuspected(input: {
    normalizedThai: string;
    maxCodePointDistance: number;
    limit: 5;
  }): Promise<VocabularyProductionSuspect[]> {
    const rows = await this.database
      .select({
        id: vocabularies.id,
        normalizedThai: vocabularies.normalizedThai,
        status: vocabularies.status,
      })
      .from(vocabularies)
      .where(inArray(vocabularies.status, ['DRAFT', 'PUBLISHED', 'HIDDEN']));

    return rows
      .filter((row) => row.normalizedThai !== input.normalizedThai)
      .map((row) => ({
        vocabularyId: row.id,
        normalizedThai: row.normalizedThai,
        codePointDistance: codePointDistance(
          input.normalizedThai,
          row.normalizedThai,
        ),
      }))
      .filter((row) => row.codePointDistance <= input.maxCodePointDistance)
      .sort(
        (left, right) =>
          left.codePointDistance - right.codePointDistance ||
          left.vocabularyId.localeCompare(right.vocabularyId),
      )
      .slice(0, input.limit);
  }
}

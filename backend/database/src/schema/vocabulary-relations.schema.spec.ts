/** 어휘 뜻 관계의 방향과 검토 상태를 검증한다 */
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  vocabularyMeaningRelationDirectionEnum,
  vocabularyMeaningRelationStatusEnum,
  vocabularyMeaningRelationTypeEnum,
  vocabularyMeaningRelations,
} from './vocabulary.schema.js';

describe('어휘 관계 schema', () => {
  it('관계 enum을 고정한다', () => {
    expect(vocabularyMeaningRelationTypeEnum.enumValues).toEqual([
      'SYNONYM',
      'ANTONYM',
      'RELATED',
    ]);
    expect(vocabularyMeaningRelationDirectionEnum.enumValues).toEqual([
      'DIRECTED',
      'BIDIRECTIONAL',
    ]);
    expect(vocabularyMeaningRelationStatusEnum.enumValues).toEqual([
      'PENDING',
      'PASSED',
      'FAILED',
    ]);
  });

  it('자기 관계·양방향 canonical 순서를 DB 제약으로 보호한다', () => {
    expect(
      getTableConfig(vocabularyMeaningRelations).checks.map(({ name }) => name),
    ).toEqual([
      'vocabulary_meaning_relations_not_self',
      'vocabulary_meaning_relations_bidirectional_order',
    ]);
    expect(
      getTableConfig(vocabularyMeaningRelations).uniqueConstraints.map(
        ({ name }) => name,
      ),
    ).toContain('vocabulary_meaning_relations_unique');
  });
});

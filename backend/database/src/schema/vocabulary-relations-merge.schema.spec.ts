/** 어휘 관계·병합 이력과 MERGED 대표 연결 schema를 검증한다 */
import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  vocabularyMeaningRelationDirectionEnum,
  vocabularyMeaningRelationStatusEnum,
  vocabularyMeaningRelationTypeEnum,
  vocabularyMeaningRelations,
  vocabularyMergeHistory,
  vocabularies,
  vocabularyStatusEnum,
} from './vocabulary.schema.js';

const migrationSql = readFileSync(
  new URL('../../drizzle/0014_new_blazing_skull.sql', import.meta.url),
  'utf8',
);

describe('어휘 관계와 병합 schema', () => {
  it('MERGED 상태와 관계 enum을 고정한다', () => {
    expect(vocabularyStatusEnum.enumValues).toEqual([
      'DRAFT',
      'PUBLISHED',
      'HIDDEN',
      'MERGED',
    ]);
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

  it('대표 어휘 연결·자기 관계·양방향 canonical 순서를 DB 제약으로 보호한다', () => {
    expect(vocabularies.mergedIntoVocabularyId).toBeDefined();
    expect(
      getTableConfig(vocabularies).checks.map(({ name }) => name),
    ).toContain('vocabularies_merge_state_match');
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

  it('병합 이력에 fingerprint·이동 수·감사 문맥을 보존한다', () => {
    const columns = getTableConfig(vocabularyMergeHistory).columns.map(
      ({ name }) => name,
    );
    expect(columns).toEqual([
      'id',
      'source_vocabulary_id',
      'representative_vocabulary_id',
      'fingerprint',
      'source_snapshot',
      'representative_snapshot',
      'moved_counts',
      'actor_user_id',
      'request_id',
      'merged_at',
    ]);
  });

  it('병합 중 같은 vocabulary 복합 FK를 원자적으로 옮길 수 있게 지연한다', () => {
    const constraintNames = [
      'vocabulary_meaning_pronunciations_meaning_fk',
      'vocabulary_meaning_pronunciations_pronunciation_fk',
      'token_occurrences_meaning_vocabulary_fk',
      'token_occurrences_pronunciation_vocabulary_fk',
      'expression_occurrences_meaning_vocabulary_fk',
      'expression_occurrences_pronunciation_vocabulary_fk',
      'vocabulary_practice_questions_meaning_vocabulary_fk',
      'vocabulary_practice_questions_pronunciation_vocabulary_fk',
    ];

    for (const constraintName of constraintNames) {
      expect(migrationSql).toContain(
        `ALTER CONSTRAINT "${constraintName}" DEFERRABLE INITIALLY IMMEDIATE`,
      );
    }
  });
});

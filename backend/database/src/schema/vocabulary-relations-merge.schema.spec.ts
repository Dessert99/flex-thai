/** 어휘 관계·병합 이력과 MERGED 대표 연결 schema를 검증한다 */
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
});

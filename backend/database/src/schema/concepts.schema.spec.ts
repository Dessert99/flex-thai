/** 개념 게시 schema의 수명·순서 제약을 검증한다 */
import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  conceptBlockExamples,
  conceptBlockKindEnum,
  conceptBlocks,
  conceptCategoryEnum,
  concepts,
  conceptStatusEnum,
  conceptValidationStatusEnum,
  conceptVersions,
  conceptVersionStatusEnum,
} from './concepts.schema.js';

const indexes = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).indexes.map((index) => ({
    name: index.config.name,
    unique: index.config.unique,
    partial: index.config.where !== undefined,
  }));

const foreignKeys = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();
    return {
      target: getTableName(reference.foreignTable),
      columns: reference.columns.map(({ name }) => name),
      foreignColumns: reference.foreignColumns.map(({ name }) => name),
    };
  });

describe('개념 학습 데이터베이스 schema', () => {
  it('개념 상태 enum 값을 고정한다', () => {
    expect(conceptCategoryEnum.enumValues).toEqual([
      'THAI_SCRIPT_PRONUNCIATION',
      'GRAMMAR',
    ]);
    expect(conceptStatusEnum.enumValues).toEqual([
      'DRAFT',
      'PUBLISHED',
      'HIDDEN',
    ]);
    expect(conceptVersionStatusEnum.enumValues).toEqual([
      'DRAFT',
      'PUBLISHED',
      'RETIRED',
    ]);
    expect(conceptValidationStatusEnum.enumValues).toEqual([
      'PENDING',
      'PASSED',
      'FAILED',
    ]);
    expect(conceptBlockKindEnum.enumValues).toEqual([
      'EXPLANATION',
      'RULE_TABLE',
      'THAI_EXAMPLES',
    ]);
  });

  it('버전 번호와 단일 초안 및 위치 중복을 차단한다', () => {
    expect(indexes(conceptVersions)).toEqual(
      expect.arrayContaining([
        {
          name: 'concept_versions_concept_version_unique',
          unique: true,
          partial: false,
        },
        {
          name: 'concept_versions_single_draft_unique',
          unique: true,
          partial: true,
        },
      ]),
    );
    expect(indexes(conceptBlocks)).toContainEqual({
      name: 'concept_blocks_version_position_unique',
      unique: true,
      partial: false,
    });
    expect(indexes(conceptBlockExamples)).toContainEqual({
      name: 'concept_block_examples_block_position_unique',
      unique: true,
      partial: false,
    });
    expect(indexes(conceptBlockExamples)).toContainEqual({
      name: 'concept_block_examples_block_sentence_unique',
      unique: true,
      partial: false,
    });
  });

  it('현재 버전과 문장 버전의 소유 참조를 고정한다', () => {
    const conceptForeignKeys = foreignKeys(concepts);
    const exampleForeignKeys = getTableConfig(
      conceptBlockExamples,
    ).foreignKeys.map((foreignKey) =>
      getTableName(foreignKey.reference().foreignTable),
    );

    expect(conceptForeignKeys).toContainEqual({
      target: 'concept_versions',
      columns: ['id', 'current_published_version_id'],
      foreignColumns: ['concept_id', 'id'],
    });
    expect(exampleForeignKeys).toContain('thai_sentence_versions');
  });

  it('검증과 게시 timestamp의 상태 일관성을 고정한다', () => {
    const checkNames = getTableConfig(conceptVersions).checks.map(
      ({ name }) => name,
    );

    expect(checkNames).toEqual(
      expect.arrayContaining([
        'concept_versions_validation_consistent',
        'concept_versions_publication_consistent',
      ]),
    );
  });
});

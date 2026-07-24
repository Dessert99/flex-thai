/** 문제 게시 schema의 버전 소유 관계와 불변 제약을 검증한다 */
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  auditLogs,
  questionBlockKindEnum,
  questionBlocks,
  questionBlockSentences,
  questionDisplayModeEnum,
  questionOptions,
  questionSkillEnum,
  questionStatusEnum,
  questionTemplateEnum,
  questionTypes,
  questionTypeVersions,
  questionValidationStatusEnum,
  questions,
  questionVersions,
  questionVersionStatusEnum,
} from './index.js';

const indexSummaries = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).indexes.map((index) => ({
    name: index.config.name,
    columns: index.config.columns.map((column) => {
      if ('name' in column) {
        return column.name;
      }

      return undefined;
    }),
    unique: index.config.unique,
    partial: index.config.where !== undefined,
  }));

const uniqueConstraintSummaries = (
  table: Parameters<typeof getTableConfig>[0],
) =>
  getTableConfig(table).uniqueConstraints.map((constraint) => ({
    name: constraint.name,
    columns: constraint.columns.map((column) => column.name),
  }));

const foreignKeySummaries = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();

    return {
      sourceTable: getTableName(foreignKey.table),
      targetTable: getTableName(reference.foreignTable),
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      onDelete: foreignKey.onDelete,
    };
  });

describe('문제 게시 데이터베이스 schema', () => {
  it('문제 enum의 허용 값을 고정한다', () => {
    expect(questionSkillEnum.enumValues).toEqual(['READING', 'LISTENING']);
    expect(questionTemplateEnum.enumValues).toEqual([
      'STANDARD_CHOICE',
      'PASSAGE_CHOICE',
      'DIALOGUE_CHOICE',
    ]);
    expect(questionStatusEnum.enumValues).toEqual([
      'DRAFT',
      'PUBLISHED',
      'HIDDEN',
    ]);
    expect(questionVersionStatusEnum.enumValues).toEqual([
      'DRAFT',
      'PUBLISHED',
      'RETIRED',
      'INVALIDATED',
    ]);
    expect(questionValidationStatusEnum.enumValues).toEqual([
      'PENDING',
      'PASSED',
      'FAILED',
    ]);
    expect(questionBlockKindEnum.enumValues).toEqual([
      'INSTRUCTION',
      'PASSAGE',
      'DIALOGUE',
      'QUESTION',
      'EXPLANATION',
    ]);
    expect(questionDisplayModeEnum.enumValues).toEqual([
      'TEXT',
      'AUDIO',
      'TEXT_AND_AUDIO',
      'AUDIO_THEN_REVEAL',
    ]);
  });

  it('문제 유형 slug와 유형·문제 버전 번호의 중복을 차단한다', () => {
    expect(indexSummaries(questionTypes)).toContainEqual({
      name: 'question_types_slug_unique',
      columns: ['slug'],
      unique: true,
      partial: false,
    });
    expect(indexSummaries(questionTypeVersions)).toContainEqual({
      name: 'question_type_versions_type_version_unique',
      columns: ['question_type_id', 'version'],
      unique: true,
      partial: false,
    });
    expect(indexSummaries(questionVersions)).toContainEqual({
      name: 'question_versions_question_version_unique',
      columns: ['question_id', 'version'],
      unique: true,
      partial: false,
    });
  });

  it('현재 게시 버전은 같은 문제가 소유한 버전만 가리킨다', () => {
    expect(uniqueConstraintSummaries(questionVersions)).toContainEqual({
      name: 'question_versions_question_id_id_unique',
      columns: ['question_id', 'id'],
    });
    expect(foreignKeySummaries(questions)).toContainEqual({
      sourceTable: 'questions',
      targetTable: 'question_versions',
      columns: ['id', 'current_published_version_id'],
      foreignColumns: ['question_id', 'id'],
      onDelete: 'restrict',
    });
  });

  it('블록·문장·선택지 위치와 선택지 소유 복합 키를 고정한다', () => {
    expect(indexSummaries(questionBlocks)).toContainEqual({
      name: 'question_blocks_version_position_unique',
      columns: ['question_version_id', 'position'],
      unique: true,
      partial: false,
    });
    expect(indexSummaries(questionBlockSentences)).toContainEqual({
      name: 'question_block_sentences_block_position_unique',
      columns: ['block_id', 'position'],
      unique: true,
      partial: false,
    });
    expect(indexSummaries(questionOptions)).toContainEqual({
      name: 'question_options_version_position_unique',
      columns: ['question_version_id', 'position'],
      unique: true,
      partial: false,
    });
    expect(uniqueConstraintSummaries(questionOptions)).toContainEqual({
      name: 'question_options_question_version_id_id_unique',
      columns: ['question_version_id', 'id'],
    });
  });

  it('문제 버전마다 정답 선택지는 최대 하나만 허용한다', () => {
    expect(indexSummaries(questionOptions)).toContainEqual({
      name: 'question_options_one_correct_per_version',
      columns: ['question_version_id'],
      unique: true,
      partial: true,
    });
  });

  it('모든 문제 콘텐츠 FK는 삭제를 제한한다', () => {
    const tables = [
      questionTypeVersions,
      questions,
      questionVersions,
      questionBlocks,
      questionBlockSentences,
      questionOptions,
    ];
    const foreignKeys = tables.flatMap(foreignKeySummaries);

    expect(foreignKeys).toHaveLength(9);
    expect(foreignKeys.every(({ onDelete }) => onDelete === 'restrict')).toBe(
      true,
    );
  });

  it('버전과 선택지 수는 양수이고 난이도와 위치 범위를 제한한다', () => {
    expect(
      getTableConfig(questionTypeVersions).checks.map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        'question_type_versions_version_positive',
        'question_type_versions_option_count_positive',
      ]),
    );
    expect(
      getTableConfig(questionVersions).checks.map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        'question_versions_version_positive',
        'question_versions_difficulty_range',
      ]),
    );
    expect(
      getTableConfig(questionBlocks).checks.map(({ name }) => name),
    ).toEqual(expect.arrayContaining(['question_blocks_position_nonnegative']));
    expect(
      getTableConfig(questionBlockSentences).checks.map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining(['question_block_sentences_position_nonnegative']),
    );
    expect(
      getTableConfig(questionOptions).checks.map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining(['question_options_position_nonnegative']),
    );
  });

  it('감사 로그에 nullable 구조화 대상을 추가한다', () => {
    const columns = getTableColumns(auditLogs);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining(['actorUserId', 'targetType', 'targetId']),
    );
    expect(columns.actorUserId.notNull).toBe(false);
    expect(columns.targetType.notNull).toBe(false);
    expect(columns.targetId.notNull).toBe(false);
  });
});

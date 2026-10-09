/** 학습 기록 schema의 append-only 수명과 교차 참조 방지 제약을 검증한다 */
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wordbookItems, wordbooks } from './learning.schema.js';

const questionMigrationSql = readFileSync(
  new URL('../../drizzle/0004_question-publishing.sql', import.meta.url),
  'utf8',
);
const readMigrationSql = () =>
  readFileSync(
    new URL('../../drizzle/0005_learning-flow.sql', import.meta.url),
    'utf8',
  );

const indexSummaries = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).indexes.map((index) => ({
    name: index.config.name,
    columns: index.config.columns.map((column) =>
      'name' in column ? column.name : undefined,
    ),
    unique: index.config.unique,
  }));

const normalizeUniqueSummaries = (
  summaries: Array<{
    name: string | undefined;
    columns: Array<string | undefined>;
  }>,
) =>
  summaries
    .map(({ name, columns }) => ({ name: name ?? '<unnamed>', columns }))
    .sort((left, right) => left.name.localeCompare(right.name));

const uniqueSummaries = (table: Parameters<typeof getTableConfig>[0]) => {
  const config = getTableConfig(table);

  return normalizeUniqueSummaries([
    ...indexSummaries(table)
      .filter(({ unique }) => unique)
      .map(({ name, columns }) => ({ name, columns })),
    ...config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      columns: constraint.columns.map((column) => column.name),
    })),
  ]);
};

const columnSummaries = (table: Parameters<typeof getTableConfig>[0]) =>
  Object.fromEntries(
    Object.entries(getTableColumns(table)).map(([property, column]) => [
      property,
      {
        name: column.name,
        sqlType: column.getSQLType(),
        dataType: column.dataType,
        notNull: column.notNull,
        hasDefault: column.hasDefault,
        primary: column.primary,
      },
    ]),
  );

const foreignKeySummaries = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();

    return {
      name: foreignKey.getName(),
      sourceTable: getTableName(foreignKey.table),
      targetTable: getTableName(reference.foreignTable),
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      onDelete: foreignKey.onDelete,
    };
  });

const primaryKeySummaries = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).primaryKeys.map((primaryKey) => ({
    name: primaryKey.getName(),
    columns: primaryKey.columns.map((column) => column.name),
  }));

describe('학습 기록 데이터베이스 schema', () => {
  it('단어장 table 두 개를 공개한다', () => {
    expect(getTableName(wordbooks)).toBe('wordbooks');
    expect(getTableName(wordbookItems)).toBe('wordbook_items');
    expect(columnSummaries(wordbooks)).toEqual({
      id: {
        name: 'id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: true,
        primary: true,
      },
      userId: {
        name: 'user_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      name: {
        name: 'name',
        sqlType: 'varchar(50)',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      createdAt: {
        name: 'created_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      updatedAt: {
        name: 'updated_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
    });
    expect(columnSummaries(wordbookItems)).toEqual({
      wordbookId: {
        name: 'wordbook_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      vocabularyId: {
        name: 'vocabulary_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      addedAt: {
        name: 'added_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
    });
  });

  it('사용자 안의 exact 이름과 단어장 안의 어휘 중복을 막는다', () => {
    expect(uniqueSummaries(wordbooks)).toEqual([
      {
        name: 'wordbooks_user_name_unique',
        columns: ['user_id', 'name'],
      },
    ]);
    expect(primaryKeySummaries(wordbookItems)).toEqual([
      {
        name: 'wordbook_items_pk',
        columns: ['wordbook_id', 'vocabulary_id'],
      },
    ]);
  });

  it('단어장 삭제만 항목을 cascade하고 사용자·어휘 삭제는 제한한다', () => {
    expect([
      ...foreignKeySummaries(wordbooks),
      ...foreignKeySummaries(wordbookItems),
    ]).toEqual([
      {
        name: 'wordbooks_user_id_users_id_fk',
        sourceTable: 'wordbooks',
        targetTable: 'users',
        columns: ['user_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
      {
        name: 'wordbook_items_wordbook_id_wordbooks_id_fk',
        sourceTable: 'wordbook_items',
        targetTable: 'wordbooks',
        columns: ['wordbook_id'],
        foreignColumns: ['id'],
        onDelete: 'cascade',
      },
      {
        name: 'wordbook_items_vocabulary_id_vocabularies_id_fk',
        sourceTable: 'wordbook_items',
        targetTable: 'vocabularies',
        columns: ['vocabulary_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
    ]);
  });

  it('어휘 membership 조회와 고정 페이지 정렬 index를 제공한다', () => {
    expect(indexSummaries(wordbookItems)).toEqual([
      {
        name: 'wordbook_items_vocabulary_id_idx',
        columns: ['vocabulary_id'],
        unique: false,
      },
      {
        name: 'wordbook_items_page_idx',
        columns: ['wordbook_id', 'added_at', 'vocabulary_id'],
        unique: false,
      },
    ]);
  });

  it('exact unique 비교는 필수 제약 외 추가 unique mutation도 거부한다', () => {
    const requiredUniqueIndexes = [
      {
        name: 'question_attempts_user_client_attempt_unique',
        columns: ['user_id', 'client_attempt_id'],
      },
      {
        name: 'question_attempts_user_question_attempt_unique',
        columns: ['user_id', 'question_id', 'attempt_no'],
      },
    ];
    const mutatedIndexes = [
      ...requiredUniqueIndexes.map((index) => ({ ...index, unique: true })),
      {
        name: 'question_attempts_user_question_unique',
        columns: ['user_id', 'question_id'],
        unique: true,
      },
    ];

    expect(mutatedIndexes).toEqual(
      expect.arrayContaining(
        requiredUniqueIndexes.map((index) => ({ ...index, unique: true })),
      ),
    );
    expect(normalizeUniqueSummaries(mutatedIndexes)).not.toEqual(
      requiredUniqueIndexes,
    );
  });

  it('복합 FK 대상 unique는 generated SQL에서 참조보다 먼저 존재한다', () => {
    const migrationSql = readMigrationSql();
    const generatedSql = `${questionMigrationSql}\n${migrationSql}`;
    const targetUniquePositions = [
      generatedSql.indexOf('"question_versions_question_id_id_unique"'),
      generatedSql.indexOf('"question_options_question_version_id_id_unique"'),
    ];
    const compositeForeignKeyPositions = [
      generatedSql.indexOf('"question_attempts_question_version_fk"'),
      generatedSql.indexOf('"question_attempts_selected_option_fk"'),
    ];

    expect(targetUniquePositions).not.toContain(-1);
    expect(compositeForeignKeyPositions).not.toContain(-1);
    expect(Math.max(...targetUniquePositions)).toBeLessThan(
      Math.min(...compositeForeignKeyPositions),
    );
  });

  it('additive migration은 destructive SQL 없이 모든 콘텐츠 삭제를 제한한다', () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).not.toMatch(/\b(?:drop|delete\s+from|truncate)\b/i);
    expect(migrationSql.match(/ON DELETE restrict/g)).toHaveLength(7);
  });
});

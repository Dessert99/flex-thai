/** 학습 기록 schema의 append-only 수명과 교차 참조 방지 제약을 검증한다 */
import { readFileSync } from 'node:fs';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  questionAttempts,
  savedQuestions,
  savedVocabularies,
} from './index.js';

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
  it('학습 기록 table 세 개를 공개한다', () => {
    expect(questionAttempts).toBeDefined();
    expect(savedQuestions).toBeDefined();
    expect(savedVocabularies).toBeDefined();
  });

  it('답안은 제출 당시 사실만 append-only column으로 보존한다', () => {
    const columns = getTableColumns(questionAttempts);

    expect(columnSummaries(questionAttempts)).toEqual({
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
      questionId: {
        name: 'question_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      questionVersionId: {
        name: 'question_version_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      attemptNo: {
        name: 'attempt_no',
        sqlType: 'integer',
        dataType: 'number',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      selectedOptionId: {
        name: 'selected_option_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      clientAttemptId: {
        name: 'client_attempt_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      durationMs: {
        name: 'duration_ms',
        sqlType: 'bigint',
        dataType: 'number',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      isCorrect: {
        name: 'is_correct',
        sqlType: 'boolean',
        dataType: 'boolean',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      submittedAt: {
        name: 'submitted_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
    });
    expect(columns).not.toHaveProperty('updatedAt');
    expect(columns).not.toHaveProperty('deletedAt');
    expect(columns).not.toHaveProperty('deletedBy');
  });

  it('사용자별 답안 순서와 clientAttemptId 재전송을 exact unique로 막는다', () => {
    expect(uniqueSummaries(questionAttempts)).toEqual([
      {
        name: 'question_attempts_user_client_attempt_unique',
        columns: ['user_id', 'client_attempt_id'],
      },
      {
        name: 'question_attempts_user_question_attempt_unique',
        columns: ['user_id', 'question_id', 'attempt_no'],
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

  it('답안의 문제 버전과 선택지가 같은 소유 관계일 때만 참조한다', () => {
    expect(foreignKeySummaries(questionAttempts)).toEqual([
      {
        name: 'question_attempts_user_id_users_id_fk',
        sourceTable: 'question_attempts',
        targetTable: 'users',
        columns: ['user_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
      {
        name: 'question_attempts_question_version_fk',
        sourceTable: 'question_attempts',
        targetTable: 'question_versions',
        columns: ['question_id', 'question_version_id'],
        foreignColumns: ['question_id', 'id'],
        onDelete: 'restrict',
      },
      {
        name: 'question_attempts_selected_option_fk',
        sourceTable: 'question_attempts',
        targetTable: 'question_options',
        columns: ['question_version_id', 'selected_option_id'],
        foreignColumns: ['question_version_id', 'id'],
        onDelete: 'restrict',
      },
    ]);
  });

  it('답안 번호는 양수이고 durationMs는 JavaScript safe integer 범위다', () => {
    const migrationSql = readMigrationSql();

    expect(
      getTableConfig(questionAttempts).checks.map(({ name }) => name),
    ).toEqual([
      'question_attempts_attempt_no_positive',
      'question_attempts_duration_ms_safe_integer',
    ]);
    expect(migrationSql).toContain(
      'CONSTRAINT "question_attempts_attempt_no_positive" CHECK ("question_attempts"."attempt_no" > 0)',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "question_attempts_duration_ms_safe_integer" CHECK ("question_attempts"."duration_ms" >= 0 and "question_attempts"."duration_ms" <= 9007199254740991)',
    );
  });

  it('답안 이력 조회와 저장 대상 탐색 index를 고정한다', () => {
    expect(indexSummaries(questionAttempts)).toContainEqual({
      name: 'question_attempts_user_submitted_at_idx',
      columns: ['user_id', 'submitted_at'],
      unique: false,
    });
    expect(indexSummaries(savedQuestions)).toContainEqual({
      name: 'saved_questions_question_id_idx',
      columns: ['question_id'],
      unique: false,
    });
    expect(indexSummaries(savedVocabularies)).toContainEqual({
      name: 'saved_vocabularies_vocabulary_id_idx',
      columns: ['vocabulary_id'],
      unique: false,
    });
  });

  it('저장 문제와 어휘는 사용자·대상 연결 외의 기능을 갖지 않는다', () => {
    expect(columnSummaries(savedQuestions)).toEqual({
      userId: {
        name: 'user_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      questionId: {
        name: 'question_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      savedAt: {
        name: 'saved_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
    });
    expect(columnSummaries(savedVocabularies)).toEqual({
      userId: {
        name: 'user_id',
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
      savedAt: {
        name: 'saved_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
    });
    expect(primaryKeySummaries(savedQuestions)).toEqual([
      {
        name: 'saved_questions_pk',
        columns: ['user_id', 'question_id'],
      },
    ]);
    expect(primaryKeySummaries(savedVocabularies)).toEqual([
      {
        name: 'saved_vocabularies_pk',
        columns: ['user_id', 'vocabulary_id'],
      },
    ]);
  });

  it('저장 연결의 사용자와 대상 FK는 모두 삭제를 제한한다', () => {
    expect([
      ...foreignKeySummaries(savedQuestions),
      ...foreignKeySummaries(savedVocabularies),
    ]).toEqual([
      {
        name: 'saved_questions_user_id_users_id_fk',
        sourceTable: 'saved_questions',
        targetTable: 'users',
        columns: ['user_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
      {
        name: 'saved_questions_question_id_questions_id_fk',
        sourceTable: 'saved_questions',
        targetTable: 'questions',
        columns: ['question_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
      {
        name: 'saved_vocabularies_user_id_users_id_fk',
        sourceTable: 'saved_vocabularies',
        targetTable: 'users',
        columns: ['user_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
      {
        name: 'saved_vocabularies_vocabulary_id_vocabularies_id_fk',
        sourceTable: 'saved_vocabularies',
        targetTable: 'vocabularies',
        columns: ['vocabulary_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
    ]);
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

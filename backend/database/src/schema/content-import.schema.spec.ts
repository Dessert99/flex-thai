/** 콘텐츠 가져오기 schema의 멱등성과 처리 결과 무결성을 검증한다 */
import { readFileSync } from 'node:fs';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  contentImportItemKindEnum,
  contentImportItemStatusEnum,
  contentImportItems,
  contentImports,
  contentImportStatusEnum,
} from './index.js';

const readMigrationSql = () =>
  readFileSync(
    new URL('../../drizzle/0006_admin-content.sql', import.meta.url),
    'utf8',
  );

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

const uniqueIndexSummaries = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table)
    .indexes.filter(({ config }) => config.unique)
    .map(({ config }) => ({
      name: config.name,
      columns: config.columns.map((column) =>
        'name' in column ? column.name : undefined,
      ),
    }));

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

describe('콘텐츠 가져오기 데이터베이스 schema', () => {
  it('최종 가져오기 상태와 항목 종류·결과 enum을 고정한다', () => {
    expect(contentImportStatusEnum.enumValues).toEqual([
      'COMPLETED',
      'COMPLETED_WITH_FAILURES',
    ]);
    expect(contentImportItemKindEnum.enumValues).toEqual([
      'VOCABULARY',
      'QUESTION',
    ]);
    expect(contentImportItemStatusEnum.enumValues).toEqual([
      'IMPORTED',
      'REJECTED',
    ]);
  });

  it('가져오기 요청과 처리 집계 column metadata를 정확히 고정한다', () => {
    expect(columnSummaries(contentImports)).toEqual({
      id: {
        name: 'id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: true,
        primary: true,
      },
      requestedBy: {
        name: 'requested_by',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      idempotencyKey: {
        name: 'idempotency_key',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      requestHash: {
        name: 'request_hash',
        sqlType: 'text',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      status: {
        name: 'status',
        sqlType: 'content_import_status',
        dataType: 'string',
        notNull: false,
        hasDefault: false,
        primary: false,
      },
      vocabularyCount: {
        name: 'vocabulary_count',
        sqlType: 'integer',
        dataType: 'number',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      questionCount: {
        name: 'question_count',
        sqlType: 'integer',
        dataType: 'number',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      importedCount: {
        name: 'imported_count',
        sqlType: 'integer',
        dataType: 'number',
        notNull: true,
        hasDefault: true,
        primary: false,
      },
      rejectedCount: {
        name: 'rejected_count',
        sqlType: 'integer',
        dataType: 'number',
        notNull: true,
        hasDefault: true,
        primary: false,
      },
      createdAt: {
        name: 'created_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: true,
        primary: false,
      },
      completedAt: {
        name: 'completed_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: false,
        hasDefault: false,
        primary: false,
      },
    });
  });

  it('개별 항목 결과와 내부 참조 map column metadata를 정확히 고정한다', () => {
    expect(columnSummaries(contentImportItems)).toEqual({
      id: {
        name: 'id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: true,
        primary: true,
      },
      importId: {
        name: 'import_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      kind: {
        name: 'kind',
        sqlType: 'content_import_item_kind',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      sourceIndex: {
        name: 'source_index',
        sqlType: 'integer',
        dataType: 'number',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      clientRef: {
        name: 'client_ref',
        sqlType: 'text',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      status: {
        name: 'status',
        sqlType: 'content_import_item_status',
        dataType: 'string',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      targetId: {
        name: 'target_id',
        sqlType: 'uuid',
        dataType: 'string',
        notNull: false,
        hasDefault: false,
        primary: false,
      },
      errors: {
        name: 'errors',
        sqlType: 'jsonb',
        dataType: 'json',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      referenceMap: {
        name: 'reference_map',
        sqlType: 'jsonb',
        dataType: 'json',
        notNull: true,
        hasDefault: false,
        primary: false,
      },
      createdAt: {
        name: 'created_at',
        sqlType: 'timestamp with time zone',
        dataType: 'date',
        notNull: true,
        hasDefault: true,
        primary: false,
      },
    });
  });

  it('요청자 멱등 key와 항목 원본 위치를 exact unique로 고정한다', () => {
    expect(uniqueIndexSummaries(contentImports)).toEqual([
      {
        name: 'content_imports_requested_by_idempotency_key_unique',
        columns: ['requested_by', 'idempotency_key'],
      },
    ]);
    expect(uniqueIndexSummaries(contentImportItems)).toEqual([
      {
        name: 'content_import_items_import_kind_source_index_unique',
        columns: ['import_id', 'kind', 'source_index'],
      },
    ]);
  });

  it('요청자와 가져오기 부모 삭제를 모두 제한한다', () => {
    expect([
      ...foreignKeySummaries(contentImports),
      ...foreignKeySummaries(contentImportItems),
    ]).toEqual([
      {
        name: 'content_imports_requested_by_users_id_fk',
        sourceTable: 'content_imports',
        targetTable: 'users',
        columns: ['requested_by'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
      {
        name: 'content_import_items_import_id_content_imports_id_fk',
        sourceTable: 'content_import_items',
        targetTable: 'content_imports',
        columns: ['import_id'],
        foreignColumns: ['id'],
        onDelete: 'restrict',
      },
    ]);
  });

  it('집계·완료 상태와 항목 결과의 CHECK 이름을 exact하게 고정한다', () => {
    expect(
      getTableConfig(contentImports).checks.map(({ name }) => name),
    ).toEqual([
      'content_imports_request_hash_sha256',
      'content_imports_counts_nonnegative',
      'content_imports_total_count_range',
      'content_imports_processed_count_consistency',
      'content_imports_status_completion_consistency',
      'content_imports_final_status_result_consistency',
    ]);
    expect(
      getTableConfig(contentImportItems).checks.map(({ name }) => name),
    ).toEqual([
      'content_import_items_source_index_nonnegative',
      'content_import_items_client_ref_nonempty',
      'content_import_items_errors_shape',
      'content_import_items_reference_map_shape',
      'content_import_items_result_consistency',
    ]);
  });

  it('생성 migration은 enum·FK·UNIQUE·CHECK만 additive하게 추가한다', () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain(
      `CREATE TYPE "public"."content_import_status" AS ENUM('COMPLETED', 'COMPLETED_WITH_FAILURES');`,
    );
    expect(migrationSql).toContain(
      `CREATE TYPE "public"."content_import_item_kind" AS ENUM('VOCABULARY', 'QUESTION');`,
    );
    expect(migrationSql).toContain(
      `CREATE TYPE "public"."content_import_item_status" AS ENUM('IMPORTED', 'REJECTED');`,
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "content_imports_requested_by_idempotency_key_unique" ON "content_imports" USING btree ("requested_by","idempotency_key")',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "content_import_items_import_kind_source_index_unique" ON "content_import_items" USING btree ("import_id","kind","source_index")',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "content_imports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "content_import_items_import_id_content_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."content_imports"("id") ON DELETE restrict',
    );
    for (const constraintName of [
      'content_imports_request_hash_sha256',
      'content_imports_counts_nonnegative',
      'content_imports_total_count_range',
      'content_imports_processed_count_consistency',
      'content_imports_status_completion_consistency',
      'content_imports_final_status_result_consistency',
      'content_import_items_source_index_nonnegative',
      'content_import_items_client_ref_nonempty',
      'content_import_items_errors_shape',
      'content_import_items_reference_map_shape',
      'content_import_items_result_consistency',
    ]) {
      expect(migrationSql).toContain(`CONSTRAINT "${constraintName}" CHECK`);
    }
    expect(migrationSql).toContain(
      `@? '$[*].keyvalue() ? (@.key != "path" && @.key != "code")'`,
    );
    expect(migrationSql).toContain(
      `@? '$.keyvalue() ? (@.key == "" || @.value.type() != "string"`,
    );
    expect(migrationSql).toContain(
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$',
    );
    expect(migrationSql).not.toMatch(/^\s*(DROP|DELETE|TRUNCATE)\b/im);
  });
});

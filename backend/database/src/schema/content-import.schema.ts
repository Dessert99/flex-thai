/** 관리자 콘텐츠 가져오기의 멱등 요청과 항목별 처리 결과를 저장한다 */
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';

type ContentImportItemError = {
  path: string;
  code: string;
};

type ContentImportReferenceMap = Record<string, string>;

/** 완료된 가져오기의 거절 항목 유무를 나타내는 최종 상태 */
export const contentImportStatusEnum = pgEnum('content_import_status', [
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
]);

/** 원본 요청에서 항목이 생성하려는 콘텐츠 종류 */
export const contentImportItemKindEnum = pgEnum('content_import_item_kind', [
  'VOCABULARY',
  'QUESTION',
]);

/** 개별 항목 transaction의 성공 또는 안정된 거절 결과 */
export const contentImportItemStatusEnum = pgEnum(
  'content_import_item_status',
  ['IMPORTED', 'REJECTED'],
);

/** canonical request hash와 동기 처리 집계를 멱등 key별로 보존한다 */
export const contentImports = pgTable(
  'content_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestedBy: uuid('requested_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: contentImportStatusEnum('status'),
    vocabularyCount: integer('vocabulary_count').notNull(),
    questionCount: integer('question_count').notNull(),
    importedCount: integer('imported_count').default(0).notNull(),
    rejectedCount: integer('rejected_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('content_imports_requested_by_idempotency_key_unique').on(
      table.requestedBy,
      table.idempotencyKey,
    ),
    check(
      'content_imports_request_hash_sha256',
      sql`${table.requestHash} ~ '^[0-9A-Fa-f]{64}$'`,
    ),
    check(
      'content_imports_counts_nonnegative',
      sql`${table.vocabularyCount} >= 0 and ${table.questionCount} >= 0 and ${table.importedCount} >= 0 and ${table.rejectedCount} >= 0`,
    ),
    check(
      'content_imports_total_count_range',
      sql`${table.vocabularyCount} + ${table.questionCount} between 1 and 100`,
    ),
    check(
      'content_imports_processed_count_consistency',
      sql`${table.importedCount} + ${table.rejectedCount} <= ${table.vocabularyCount} + ${table.questionCount}`,
    ),
    check(
      'content_imports_status_completion_consistency',
      sql`(${table.status} is null and ${table.completedAt} is null) or (${table.status} is not null and ${table.completedAt} is not null)`,
    ),
    check(
      'content_imports_final_status_result_consistency',
      sql`${table.status} is null or (${table.status} = 'COMPLETED' and ${table.rejectedCount} = 0 and ${table.importedCount} + ${table.rejectedCount} = ${table.vocabularyCount} + ${table.questionCount}) or (${table.status} = 'COMPLETED_WITH_FAILURES' and ${table.rejectedCount} > 0 and ${table.importedCount} + ${table.rejectedCount} = ${table.vocabularyCount} + ${table.questionCount})`,
    ),
  ],
);

/** 원본 위치별 draft 생성 결과와 다음 항목에서만 쓰는 참조 map을 보존한다 */
export const contentImportItems = pgTable(
  'content_import_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importId: uuid('import_id')
      .references(() => contentImports.id, { onDelete: 'restrict' })
      .notNull(),
    kind: contentImportItemKindEnum('kind').notNull(),
    sourceIndex: integer('source_index').notNull(),
    clientRef: text('client_ref').notNull(),
    status: contentImportItemStatusEnum('status').notNull(),
    targetId: uuid('target_id'),
    errors: jsonb('errors').$type<ContentImportItemError[]>().notNull(),
    referenceMap: jsonb('reference_map')
      .$type<ContentImportReferenceMap>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('content_import_items_import_kind_source_index_unique').on(
      table.importId,
      table.kind,
      table.sourceIndex,
    ),
    check(
      'content_import_items_source_index_nonnegative',
      sql`${table.sourceIndex} >= 0`,
    ),
    check(
      'content_import_items_client_ref_nonempty',
      sql`char_length(${table.clientRef}) > 0`,
    ),
    check(
      'content_import_items_errors_shape',
      sql`jsonb_typeof(${table.errors}) = 'array' and not coalesce(${table.errors} @? '$[*] ? (@.type() != "object")', true) and not coalesce(${table.errors} @? '$[*] ? (!exists(@.path) || @.path.type() != "string" || !exists(@.code) || @.code.type() != "string" || @.code == "")', true) and not coalesce(${table.errors} @? '$[*].keyvalue() ? (@.key != "path" && @.key != "code")', true)`,
    ),
    check(
      'content_import_items_reference_map_shape',
      sql`jsonb_typeof(${table.referenceMap}) = 'object' and not coalesce(${table.referenceMap} @? '$.keyvalue() ? (@.key == "" || @.value.type() != "string" || !(@.value like_regex "^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$"))', true)`,
    ),
    check(
      'content_import_items_result_consistency',
      sql`(${table.status} = 'IMPORTED' and ${table.targetId} is not null and jsonb_array_length(${table.errors}) = 0 and ${table.referenceMap} <> '{}'::jsonb) or (${table.status} = 'REJECTED' and ${table.targetId} is null and jsonb_array_length(${table.errors}) > 0 and ${table.referenceMap} = '{}'::jsonb)`,
    ),
  ],
);

/** 게시 콘텐츠가 참조하는 변경 불가능한 음성 object를 저장한다 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** MVP media 종류 */
export const mediaAssetKindEnum = pgEnum('media_asset_kind', ['AUDIO']);

/** 음성 object 검증 상태 */
export const mediaAssetStatusEnum = pgEnum('media_asset_status', [
  'UPLOADING',
  'READY',
  'REJECTED',
]);

/** 선언 metadata와 서버 검증 metadata를 분리한 private 음성 자산 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: mediaAssetKindEnum('kind').default('AUDIO').notNull(),
    storageKey: text('storage_key').notNull(),
    declaredMimeType: text('declared_mime_type').notNull(),
    declaredSizeBytes: bigint('declared_size_bytes', {
      mode: 'number',
    }).notNull(),
    declaredSha256: text('declared_sha256').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    sha256: text('sha256'),
    status: mediaAssetStatusEnum('status').default('UPLOADING').notNull(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('media_assets_storage_key_unique').on(table.storageKey),
    index('media_assets_sha256_status_idx').on(table.sha256, table.status),
    check(
      'media_assets_declared_size_safe_integer',
      sql`${table.declaredSizeBytes} > 0 and ${table.declaredSizeBytes} <= 9007199254740991`,
    ),
    check(
      'media_assets_size_safe_integer',
      sql`${table.sizeBytes} is null or (${table.sizeBytes} > 0 and ${table.sizeBytes} <= 9007199254740991)`,
    ),
    check(
      'media_assets_declared_sha256_length',
      sql`char_length(${table.declaredSha256}) = 64`,
    ),
  ],
);

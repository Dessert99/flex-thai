/** 자동 TTS 요청·항목·음성 재사용 claim과 완료 음성 자산을 저장한다 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';
import { mediaAssets } from './media.schema.js';

/** TTS job이 항목 집계로 노출하는 상태 */
export const ttsJobStatusEnum = pgEnum('tts_job_status', [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIALLY_FAILED',
  'FAILED',
]);

/** TTS 항목의 worker 처리 상태 */
export const ttsItemStatusEnum = pgEnum('tts_item_status', [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
]);

/** 같은 음성 입력의 생성 claim과 재사용 가능 상태 */
export const ttsAudioCacheStatusEnum = pgEnum('tts_audio_cache_status', [
  'PENDING',
  'GENERATING',
  'READY',
  'FAILED',
  'OUTCOME_UNKNOWN',
]);

/** item attempt별 TTS provider 호출의 외부 outcome 상태 */
export const ttsProviderRunStatusEnum = pgEnum('tts_provider_run_status', [
  'STARTED',
  'SUCCEEDED',
  'FAILED',
  'OUTCOME_UNKNOWN',
]);

/** immutable audio object의 참조 확인형 정리 상태 */
export const ttsAudioGcStatusEnum = pgEnum('tts_audio_gc_status', [
  'PENDING',
  'PROCESSING',
  'REFERENCED',
  'DELETED',
]);

/** immutable item snapshot에 남기는 TTS 대상 종류 */
export const ttsTargetKindEnum = pgEnum('tts_target_kind', [
  'VOCABULARY_PRONUNCIATION',
  'EXPRESSION',
  'THAI_SENTENCE_VERSION',
  'CONCEPT_SENTENCE',
]);

/** 관리자 요청 때 선택하는 재사용 가능한 TTS 음성 설정 */
export const ttsVoicePresets = pgTable(
  'tts_voice_presets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    voice: text('voice').notNull(),
    locale: text('locale').default('th-TH').notNull(),
    audioFormat: text('audio_format').default('audio/wav').notNull(),
    generationRevision: text('generation_revision').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('tts_voice_presets_name_generation_revision_unique').on(
      table.name,
      table.generationRevision,
    ),
  ],
);

/** 관리자 TTS 요청의 immutable voice snapshot과 항목 상태 집계 */
export const ttsJobs = pgTable('tts_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestedBy: uuid('requested_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  voiceSnapshot: jsonb('voice_snapshot')
    .$type<{
      presetId: string;
      provider: string;
      model: string;
      voice: string;
      locale: 'th-TH';
      audioFormat: 'audio/wav';
      generationRevision: string;
    }>()
    .notNull(),
  dispatchAttempt: integer('dispatch_attempt').default(0).notNull(),
  lastDispatchCommandFingerprint: text('last_dispatch_command_fingerprint'),
  status: ttsJobStatusEnum('status').default('QUEUED').notNull(),
  pendingCount: integer('pending_count').default(0).notNull(),
  processingCount: integer('processing_count').default(0).notNull(),
  succeededCount: integer('succeeded_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 대상·음성 snapshot과 lease 상태를 분리해 TTS 부분 실패를 보존한다 */
export const ttsItems = pgTable(
  'tts_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => ttsJobs.id, { onDelete: 'restrict' })
      .notNull(),
    targetKind: ttsTargetKindEnum('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    targetText: text('target_text').notNull(),
    targetRequired: boolean('target_required').notNull(),
    revision: text('revision').notNull(),
    voiceSnapshot: jsonb('voice_snapshot')
      .$type<{
        presetId: string;
        provider: string;
        model: string;
        voice: string;
        locale: 'th-TH';
        audioFormat: 'audio/wav';
        generationRevision: string;
      }>()
      .notNull(),
    cacheKey: text('cache_key').notNull(),
    status: ttsItemStatusEnum('status').default('PENDING').notNull(),
    attempt: integer('attempt').default(0).notNull(),
    leaseToken: text('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    errorCode: text('error_code'),
    retryable: boolean('retryable').default(false).notNull(),
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('tts_items_job_target_revision_unique').on(
      table.jobId,
      table.targetKind,
      table.targetId,
      table.revision,
    ),
  ],
);

/** 같은 normalized 음성 입력의 단일 생성 claim과 READY 자산을 보존한다 */
export const ttsAudioCache = pgTable(
  'tts_audio_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cacheKey: text('cache_key').notNull(),
    audioDigest: text('audio_digest'),
    status: ttsAudioCacheStatusEnum('status').default('GENERATING').notNull(),
    generationAttempt: integer('generation_attempt').default(1).notNull(),
    claimToken: text('claim_token'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    errorCode: text('error_code'),
    retryable: boolean('retryable').default(false).notNull(),
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    readyMetadataRevision: text('ready_metadata_revision'),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('tts_audio_cache_cache_key_unique').on(table.cacheKey),
    check(
      'tts_audio_cache_ready_metadata_consistent',
      sql`${table.status} <> 'READY' or (${table.mediaAssetId} is not null and ${table.readyMetadataRevision} is not null and ${table.readyAt} is not null)`,
    ),
  ],
);

/** item attempt별 provider outcome과 비용·저장 metadata를 중복 없이 보존한다 */
export const ttsProviderRuns = pgTable(
  'tts_provider_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .references(() => ttsItems.id, { onDelete: 'restrict' })
      .notNull(),
    attempt: integer('attempt').notNull(),
    cacheKey: text('cache_key').notNull(),
    cacheClaimToken: text('cache_claim_token').notNull(),
    itemLeaseToken: text('item_lease_token').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    status: ttsProviderRunStatusEnum('status').default('STARTED').notNull(),
    usage: jsonb('usage').$type<Record<string, number>>(),
    estimatedCostUsd: numeric('estimated_cost_usd', {
      precision: 18,
      scale: 8,
    }),
    providerRequestId: text('provider_request_id'),
    errorCode: text('error_code'),
    retryable: boolean('retryable').default(false).notNull(),
    storageKey: text('storage_key'),
    storageMimeType: text('storage_mime_type'),
    storageSizeBytes: bigint('storage_size_bytes', { mode: 'number' }),
    storageSha256: text('storage_sha256'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('tts_provider_runs_item_attempt_unique').on(
      table.itemId,
      table.attempt,
    ),
    index('tts_provider_runs_status_started_at_idx').on(
      table.status,
      table.startedAt,
    ),
    check('tts_provider_runs_attempt_non_negative', sql`${table.attempt} >= 0`),
    check(
      'tts_provider_runs_storage_metadata_consistent',
      sql`(${table.storageKey} is null and ${table.storageMimeType} is null and ${table.storageSizeBytes} is null and ${table.storageSha256} is null) or (${table.storageKey} is not null and ${table.storageMimeType} is not null and ${table.storageSizeBytes} > 0 and ${table.storageSizeBytes} <= 9007199254740991 and ${table.storageSha256} ~ '^[0-9A-Fa-f]{64}$')`,
    ),
    check(
      'tts_provider_runs_terminal_consistent',
      sql`(${table.status} = 'STARTED' and ${table.finishedAt} is null) or (${table.status} <> 'STARTED' and ${table.finishedAt} is not null)`,
    ),
    check(
      'tts_provider_runs_success_consistent',
      sql`${table.status} <> 'SUCCEEDED' or (${table.usage} is not null and ${table.estimatedCostUsd} is not null and ${table.errorCode} is null and ${table.retryable} = false and ${table.storageKey} is not null)`,
    ),
  ],
);

/** object write 뒤 DB 참조 실패를 lease 기반 참조 확인·삭제로 수렴시킨다 */
export const ttsAudioGcRecords = pgTable(
  'tts_audio_gc_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    status: ttsAudioGcStatusEnum('status').default('PENDING').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    processingAttempts: integer('processing_attempts').default(0).notNull(),
    lastErrorCode: text('last_error_code'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    referencedAt: timestamp('referenced_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('tts_audio_gc_records_storage_key_unique').on(table.storageKey),
    index('tts_audio_gc_records_claim_idx').on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
    ),
    check(
      'tts_audio_gc_records_size_safe_integer',
      sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 9007199254740991`,
    ),
    check(
      'tts_audio_gc_records_sha256_length',
      sql`${table.sha256} ~ '^[0-9A-Fa-f]{64}$'`,
    ),
    check(
      'tts_audio_gc_records_attempts_non_negative',
      sql`${table.processingAttempts} >= 0`,
    ),
    check(
      'tts_audio_gc_records_lease_pair_consistent',
      sql`(${table.leaseOwner} is null) = (${table.leaseExpiresAt} is null)`,
    ),
    check(
      'tts_audio_gc_records_terminal_consistent',
      sql`(${table.status} = 'REFERENCED' and ${table.referencedAt} is not null and ${table.deletedAt} is null) or (${table.status} = 'DELETED' and ${table.deletedAt} is not null and ${table.referencedAt} is null) or (${table.status} in ('PENDING', 'PROCESSING') and ${table.referencedAt} is null and ${table.deletedAt} is null)`,
    ),
  ],
);

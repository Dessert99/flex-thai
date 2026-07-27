/** 자동 TTS 요청·항목·음성 재사용 claim과 완료 음성 자산을 저장한다 */
import { sql } from 'drizzle-orm';
import {
  boolean,
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

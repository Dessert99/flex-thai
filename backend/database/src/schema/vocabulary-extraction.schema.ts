import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  primaryKey,
} from 'drizzle-orm/pg-core';
import type {
  ExtractionChunk,
  ExtractionSaveReceipt,
  ExtractionConfig,
  ExtractionSource,
} from '@flex-thia/domain/vocabulary-extraction/extraction';
export const extractionJobs = pgTable(
  'vocabulary_extraction_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').notNull(),
    requestId: uuid('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    sourceName: text('source_name').notNull(),
    source: jsonb('source').$type<ExtractionSource>().notNull(),
    prompt: text('prompt').notNull(),
    config: jsonb('config').$type<ExtractionConfig>().notNull(),
    status: text('status')
      .$type<'queued' | 'running' | 'failed' | 'stopped' | 'complete'>()
      .default('queued')
      .notNull(),
    stage: integer('stage').default(0).notNull(),
    total: integer('total').default(0).notNull(),
    completed: integer('completed').default(0).notNull(),
    compared: integer('compared').default(0).notNull(),
    error: text('error'),
    savedAt: timestamp('saved_at', { withTimezone: true }),
    receipt: jsonb('receipt').$type<ExtractionSaveReceipt>(),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('extraction_owner_request').on(t.ownerId, t.requestId),
    index('extraction_queue').on(t.status, t.createdAt),
    index('extraction_owner_created').on(t.ownerId, t.createdAt),
  ],
);
export const extractionChunks = pgTable(
  'vocabulary_extraction_chunks',
  {
    jobId: uuid('job_id')
      .references(() => extractionJobs.id, { onDelete: 'cascade' })
      .notNull(),
    ordinal: integer('ordinal').notNull(),
    data: jsonb('data').$type<ExtractionChunk>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.ordinal] })],
);

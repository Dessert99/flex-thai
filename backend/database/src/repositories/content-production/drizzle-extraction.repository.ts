import {
  extractionReviewItems,
  type ExtractionSaveReceipt,
} from '@flex-thia/domain/vocabulary-extraction/extraction';
import { normalizeThaiSearchText } from '@flex-thia/domain/vocabulary/normalize-thai-search-text';
import {
  vocabularies,
  vocabularyMeanings,
} from '../../schema/vocabulary.schema.js';
import type { databaseSchema } from '../../schema/databaseSchema.js';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, lt, sql, isNotNull } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import type {
  ExtractionRepository,
  ExtractionJob,
  ExtractionChunk,
} from '@flex-thia/domain/vocabulary-extraction/extraction';
import {
  extractionJobs as jobs,
  extractionChunks as chunks,
} from '../../schema/vocabulary-extraction.schema.js';

/** lease token으로 오래된 worker의 쓰기를 차단하고 checkpoint를 원자 저장한다. */
export class DrizzleExtractionRepository implements ExtractionRepository {
  constructor(
    private readonly db: PgDatabase<PgQueryResultHKT, typeof databaseSchema>,
  ) {}
  async review(id: string) {
    const [job] = await this.db
      .select({ receipt: jobs.receipt })
      .from(jobs)
      .where(eq(jobs.id, id));
    const addedMeaningIds = new Set(
      job?.receipt?.items.map((item) => item.meaningId) ?? [],
    );
    const data = await this.chunks(id);
    const items = extractionReviewItems(data);
    for (const item of items) {
      if (item.vocabularyId) {
        item.existingMeanings = (
          await this.db
            .select({
              id: vocabularyMeanings.id,
              meaningKo: vocabularyMeanings.meaningKo,
            })
            .from(vocabularyMeanings)
            .where(eq(vocabularyMeanings.vocabularyId, item.vocabularyId))
        )
          .filter((meaning) => !addedMeaningIds.has(meaning.id))
          .map((meaning) => meaning.meaningKo);
      }
    }
    return {
      items,
      excluded: data.reduce((n, c) => n + (c.excluded ?? 0), 0),
      receipt: job?.receipt ?? null,
    };
  }
  async latestSaved() {
    const [job] = await this.db
      .select({
        jobId: jobs.id,
        sourceName: jobs.sourceName,
        receipt: jobs.receipt,
      })
      .from(jobs)
      .where(isNotNull(jobs.savedAt))
      .orderBy(desc(jobs.savedAt), desc(jobs.id))
      .limit(1);
    return job?.receipt ? { ...job, receipt: job.receipt } : null;
  }
  async save(id: string, ownerId: string, selectedIds: string[]) {
    return this.db.transaction(async (tx) => {
      // 추출 작업 간 최종 저장과 최신 작업 갱신 순서를 직렬화한다.
      await tx.execute(sql`select pg_advisory_xact_lock(731205)`);
      const [job] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId)))
        .for('update');
      if (!job) throw new Error('EXTRACTION_NOT_FOUND');
      if (job.status !== 'complete') throw new Error('EXTRACTION_NOT_COMPLETE');
      const ids = [...selectedIds].sort();
      if (job.receipt) {
        if (JSON.stringify(ids) !== JSON.stringify(job.receipt.selectedIds))
          throw new Error('EXTRACTION_ALREADY_SAVED');
        return job.receipt;
      }
      const repository = new DrizzleExtractionRepository(tx);
      const candidates = extractionReviewItems(await repository.chunks(id));
      if (
        new Set(ids).size !== ids.length ||
        ids.some((key) => !candidates.some((item) => item.id === key))
      )
        throw new Error('EXTRACTION_SELECTION_INVALID');
      const receipt: ExtractionSaveReceipt = {
        selectedIds: ids,
        savedAt: '',
        items: [],
      };
      const createdIds = new Set<string>();
      for (const item of candidates.filter((candidate) =>
        ids.includes(candidate.id),
      )) {
        const normalizedThai = normalizeThaiSearchText(item.thai);
        const [created] = await tx
          .insert(vocabularies)
          .values({
            thai: item.thai,
            normalizedThai,
            kind: 'WORD',
            status: 'PUBLISHED',
            publishedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning();
        if (created) createdIds.add(created.id);
        const [existing] = created
          ? [created]
          : await tx
              .select()
              .from(vocabularies)
              .where(eq(vocabularies.normalizedThai, normalizedThai))
              .for('update');
        if (
          !existing ||
          existing.status === 'MERGED' ||
          (item.vocabularyId && item.vocabularyId !== existing.id)
        )
          throw new Error('EXTRACTION_VOCABULARY_CHANGED');
        const meanings = await tx
          .select()
          .from(vocabularyMeanings)
          .where(eq(vocabularyMeanings.vocabularyId, existing.id));
        if (
          meanings.some(
            (meaning) =>
              meaning.meaningKo.normalize('NFC').trim() ===
              item.meaningKo.normalize('NFC').trim(),
          )
        )
          continue;
        const [meaning] = await tx
          .insert(vocabularyMeanings)
          .values({
            vocabularyId: existing.id,
            meaningKo: item.meaningKo,
            partOfSpeech: item.partOfSpeech,
          })
          .returning();
        if (!meaning) throw new Error('EXTRACTION_SAVE_FAILED');
        receipt.items.push({
          vocabularyId: existing.id,
          meaningId: meaning.id,
          thai: existing.thai,
          meaningKo: meaning.meaningKo,
          classification: createdIds.has(existing.id)
            ? 'NEW_WORD'
            : 'NEW_MEANING',
        });
      }
      receipt.savedAt = new Date().toISOString();
      await tx
        .update(jobs)
        .set({
          receipt,
          savedAt: new Date(receipt.savedAt),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, id));
      return receipt;
    });
  }
  async create(input: Parameters<ExtractionRepository['create']>[0]) {
    const [created] = await this.db
      .insert(jobs)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [existing] = await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.ownerId, input.ownerId),
          eq(jobs.requestId, input.requestId),
        ),
      );
    if (!existing || existing.requestHash !== input.requestHash)
      throw new Error('EXTRACTION_REQUEST_CONFLICT');
    return existing;
  }
  async get(id: string, ownerId: string) {
    await this.recoverExpired();
    const [row] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId)));
    return row ?? null;
  }
  async list(ownerId: string) {
    await this.recoverExpired();
    return this.db
      .select()
      .from(jobs)
      .where(eq(jobs.ownerId, ownerId))
      .orderBy(desc(jobs.createdAt))
      .limit(50);
  }
  async retry(id: string, ownerId: string) {
    await this.recoverExpired();
    const rows = await this.db
      .update(jobs)
      .set({ status: 'queued', error: null, updatedAt: new Date() })
      .where(
        and(
          eq(jobs.id, id),
          eq(jobs.ownerId, ownerId),
          sql`${jobs.status} in ('failed','stopped')`,
        ),
      )
      .returning({ id: jobs.id });
    return rows.length > 0;
  }
  async claim() {
    await this.recoverExpired();
    const [next] = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'queued'))
      .orderBy(asc(jobs.createdAt))
      .limit(1);
    if (!next) return null;
    const [claimed] = await this.db
      .update(jobs)
      .set({
        status: 'running',
        leaseToken: randomUUID(),
        leaseUntil: new Date(Date.now() + 90000),
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, next.id), eq(jobs.status, 'queued')))
      .returning();
    return claimed ?? null;
  }
  async heartbeat(id: string, token: string) {
    const rows = await this.db
      .update(jobs)
      .set({ leaseUntil: new Date(Date.now() + 90000), updatedAt: new Date() })
      .where(
        and(
          eq(jobs.id, id),
          eq(jobs.leaseToken, token),
          eq(jobs.status, 'running'),
          sql`${jobs.leaseUntil} > now()`,
        ),
      )
      .returning({ id: jobs.id });
    return rows.length > 0;
  }
  async chunks(id: string) {
    const ordinals = await this.db
      .select({ ordinal: chunks.ordinal })
      .from(chunks)
      .where(eq(chunks.jobId, id))
      .orderBy(asc(chunks.ordinal));
    const result: ExtractionChunk[] = [];
    for (const item of ordinals) {
      const [row] = await this.db
        .select({ data: chunks.data })
        .from(chunks)
        .where(and(eq(chunks.jobId, id), eq(chunks.ordinal, item.ordinal)));
      if (row) result.push(row.data);
    }
    return result;
  }
  async prepare(job: ExtractionJob, items: ExtractionChunk[]) {
    await this.db.transaction(async (tx) => {
      await this.lock(tx, job);
      await tx
        .insert(chunks)
        .values(
          items.map((data, ordinal) => ({ jobId: job.id, ordinal, data })),
        );
      await tx
        .update(jobs)
        .set({ total: items.length, stage: 1, updatedAt: new Date() })
        .where(eq(jobs.id, job.id));
    });
  }
  async checkpoint(
    job: ExtractionJob,
    ordinal: number,
    data: ExtractionChunk,
    stage: number,
  ) {
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 400000)
      throw new Error('AI_RESULT_TOO_LARGE');
    await this.db.transaction(async (tx) => {
      await this.lock(tx, job);
      await tx
        .update(chunks)
        .set({ data })
        .where(and(eq(chunks.jobId, job.id), eq(chunks.ordinal, ordinal)));
      await tx
        .update(jobs)
        .set({
          stage,
          completed: stage === 1 ? ordinal + 1 : job.total,
          compared: stage === 2 ? ordinal + 1 : 0,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
    });
  }
  async advance(job: ExtractionJob, stage: number) {
    await this.db.transaction(async (tx) => {
      await this.lock(tx, job);
      await tx
        .update(jobs)
        .set({ stage, updatedAt: new Date() })
        .where(eq(jobs.id, job.id));
    });
  }
  async finish(job: ExtractionJob, error?: string) {
    await this.db.transaction(async (tx) => {
      await this.lock(tx, job);
      await tx
        .update(jobs)
        .set({
          status: error ? 'failed' : 'complete',
          ...(error ? {} : { stage: 4 }),
          error: error ?? null,
          leaseToken: null,
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
    });
  }
  private async recoverExpired() {
    await this.db
      .update(jobs)
      .set({
        status: 'stopped',
        error: 'WORKER_INTERRUPTED',
        leaseToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.status, 'running'), lt(jobs.leaseUntil, new Date())));
  }
  private async lock(
    tx: PgDatabase<PgQueryResultHKT, typeof databaseSchema>,
    job: ExtractionJob,
  ) {
    if (!job.leaseToken) throw new Error('EXTRACTION_LEASE_LOST');
    const [row] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, job.id),
          eq(jobs.leaseToken, job.leaseToken),
          eq(jobs.status, 'running'),
          sql`${jobs.leaseUntil} > now()`,
        ),
      )
      .for('update');
    if (!row) throw new Error('EXTRACTION_LEASE_LOST');
  }
}

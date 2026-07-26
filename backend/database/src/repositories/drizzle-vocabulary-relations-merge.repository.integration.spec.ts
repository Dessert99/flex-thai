/** 실제 PostgreSQL에서 어휘 안전 병합의 live 참조 이동·원자성·경쟁 경계를 검증한다 */
import { randomUUID } from 'node:crypto';
import {
  VocabularyRelationsMergeAdminError,
  VocabularyRelationsMergeService,
} from '@flex-thia/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../schema/index.js';
import { DrizzleVocabularyAdminRepository } from './drizzle-vocabulary-admin.repository.js';

const databaseUrl = process.env.VOCABULARY_MERGE_TEST_DATABASE_URL;

interface MergeFixture {
  actorUserId: string;
  mediaAssetId: string;
  representativeMeaningId: string;
  representativePronunciationId: string;
  representativeVocabularyId: string;
  sourceMeaningId: string;
  sourcePronunciationId: string;
  sourceVocabularyId: string;
}

const createMergeFixture = async (pool: Pool): Promise<MergeFixture> => {
  const fixture = {
    actorUserId: randomUUID(),
    mediaAssetId: randomUUID(),
    representativeMeaningId: randomUUID(),
    representativePronunciationId: randomUUID(),
    representativeVocabularyId: randomUUID(),
    sourceMeaningId: randomUUID(),
    sourcePronunciationId: randomUUID(),
    sourceVocabularyId: randomUUID(),
  };
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status, mfa_enrolled_at)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE', now())`,
    [
      fixture.actorUserId,
      `merge-${fixture.actorUserId}`,
      `merge-${fixture.actorUserId}@example.com`,
    ],
  );
  await pool.query(
    `insert into media_assets (
       id, storage_key, declared_mime_type, declared_size_bytes,
       declared_sha256, mime_type, size_bytes, sha256, status, ready_at
     ) values ($1, $2, 'audio/mpeg', 1, $3, 'audio/mpeg', 1, $3, 'READY', now())`,
    [fixture.mediaAssetId, `merge/${fixture.mediaAssetId}.mp3`, 'a'.repeat(64)],
  );
  await pool.query(
    `insert into vocabularies (
       id, thai, normalized_thai, kind, status, published_at
     ) values
       ($1, $2, $2, 'EXPRESSION', 'DRAFT', null),
       ($3, $4, $4, 'EXPRESSION', 'PUBLISHED', now())`,
    [
      fixture.sourceVocabularyId,
      `ต้นทาง-${fixture.sourceVocabularyId}`,
      fixture.representativeVocabularyId,
      `ตัวแทน-${fixture.representativeVocabularyId}`,
    ],
  );
  await pool.query(
    `insert into vocabulary_meanings (
       id, vocabulary_id, meaning_ko, part_of_speech, difficulty
     ) values
       ($1, $2, '원본 뜻', '표현', 2),
       ($3, $4, '대표 뜻', '표현', 2)`,
    [
      fixture.sourceMeaningId,
      fixture.sourceVocabularyId,
      fixture.representativeMeaningId,
      fixture.representativeVocabularyId,
    ],
  );
  await pool.query(
    `insert into vocabulary_pronunciations (
       id, vocabulary_id, pronunciation_ko, tone_marks, media_asset_id
     ) values
       ($1, $2, '원본 발음', 'M', $3),
       ($4, $5, '대표 발음', 'M', $3)`,
    [
      fixture.sourcePronunciationId,
      fixture.sourceVocabularyId,
      fixture.mediaAssetId,
      fixture.representativePronunciationId,
      fixture.representativeVocabularyId,
    ],
  );
  await pool.query(
    `insert into vocabulary_meaning_pronunciations (
       vocabulary_id, meaning_id, pronunciation_id
     ) values ($1, $2, $3), ($4, $5, $6)`,
    [
      fixture.sourceVocabularyId,
      fixture.sourceMeaningId,
      fixture.sourcePronunciationId,
      fixture.representativeVocabularyId,
      fixture.representativeMeaningId,
      fixture.representativePronunciationId,
    ],
  );
  return fixture;
};

const createService = (pool: Pool) =>
  new VocabularyRelationsMergeService(
    new DrizzleVocabularyAdminRepository(drizzle({ client: pool, schema })),
  );

const contextFor = (fixture: MergeFixture) => ({
  actorSub: `merge-${fixture.actorUserId}`,
  actorUserId: fixture.actorUserId,
  occurredAt: new Date('2026-07-27T09:00:00.000Z'),
  requestId: `merge-${randomUUID()}`,
});

const addTokenOccurrence = async (pool: Pool, fixture: MergeFixture) => {
  const sentenceId = randomUUID();
  const sentenceVersionId = randomUUID();
  const tokenId = randomUUID();
  await pool.query(`insert into thai_sentences (id) values ($1)`, [sentenceId]);
  await pool.query(
    `insert into thai_sentence_versions (
       id, sentence_id, version, original_text, translation_ko,
       pronunciation_ko, tone_marks, media_asset_id, frozen_at
     ) values ($1, $2, 1, 'หนึ่งสองสาม', '하나 둘 셋', '능 송 쌈', 'MMM', $3, now())`,
    [sentenceVersionId, sentenceId, fixture.mediaAssetId],
  );
  await pool.query(
    `insert into token_occurrences (
       id, sentence_version_id, position, surface, start_offset, end_offset,
       vocabulary_id, meaning_id, pronunciation_id, context_meaning_ko, role
     ) values ($1, $2, 0, 'หนึ่ง', 0, 5, $3, $4, $5, '하나', 'TARGET')`,
    [
      tokenId,
      sentenceVersionId,
      fixture.sourceVocabularyId,
      fixture.sourceMeaningId,
      fixture.sourcePronunciationId,
    ],
  );
  return { sentenceVersionId, tokenId };
};

const addPracticeQuestion = async (pool: Pool, fixture: MergeFixture) => {
  const sessionId = randomUUID();
  const practiceQuestionId = randomUUID();
  const correctOptionId = randomUUID();
  await pool.query(
    `insert into vocabulary_practice_sessions (
       id, user_id, source_type, source_label, modes,
       requested_question_count, question_order, question_count, started_at
     ) values (
       $1, $2, 'SEARCH_SELECTION', '병합 snapshot',
       array['AUDIO_TO_MEANING']::vocabulary_practice_mode[],
       10, 'SOURCE', 1, now()
     )`,
    [sessionId, fixture.actorUserId],
  );
  await pool.query(
    `insert into vocabulary_practice_questions (
       id, session_id, position, vocabulary_id, meaning_id, pronunciation_id,
       media_asset_id, mode, audio_storage_key, thai_snapshot,
       meaning_ko_snapshot, pronunciation_ko_snapshot, tone_marks_snapshot,
       options, correct_option_id, card_snapshot
     ) values (
       $1, $2, 1, $3, $4, $5, $6, 'AUDIO_TO_MEANING', $7,
       '원본 태국어', '원본 뜻', '원본 발음', 'M', $8::jsonb, $9, $10::jsonb
     )`,
    [
      practiceQuestionId,
      sessionId,
      fixture.sourceVocabularyId,
      fixture.sourceMeaningId,
      fixture.sourcePronunciationId,
      fixture.mediaAssetId,
      `merge/${fixture.mediaAssetId}.mp3`,
      JSON.stringify([{ id: correctOptionId, label: '원본 뜻' }]),
      correctOptionId,
      JSON.stringify({ immutable: '원본 snapshot' }),
    ],
  );
  return { correctOptionId, practiceQuestionId, sessionId };
};

const addLiveReferences = async (pool: Pool, fixture: MergeFixture) => {
  const token = await addTokenOccurrence(pool, fixture);
  const practice = await addPracticeQuestion(pool, fixture);
  const practiceAnswerId = randomUUID();
  const wordbookId = randomUUID();
  const sourceSavedAt = '2026-07-20T00:00:00.000Z';
  const representativeSavedAt = '2026-07-21T00:00:00.000Z';
  const sourceAddedAt = '2026-07-19T00:00:00.000Z';
  const representativeAddedAt = '2026-07-22T00:00:00.000Z';

  await pool.query(
    `insert into expression_occurrences (
       id, sentence_version_id, start_token_index, end_token_index,
       vocabulary_id, vocabulary_kind, meaning_id, pronunciation_id,
       context_meaning_ko, representative
     ) values ($1, $2, 0, 2, $3, 'EXPRESSION', $4, $5, '원본 표현', true)`,
    [
      randomUUID(),
      token.sentenceVersionId,
      fixture.sourceVocabularyId,
      fixture.sourceMeaningId,
      fixture.sourcePronunciationId,
    ],
  );
  await pool.query(
    `insert into saved_vocabularies (user_id, vocabulary_id, saved_at)
     values ($1, $2, $3), ($1, $4, $5)`,
    [
      fixture.actorUserId,
      fixture.sourceVocabularyId,
      sourceSavedAt,
      fixture.representativeVocabularyId,
      representativeSavedAt,
    ],
  );
  await pool.query(
    `insert into wordbooks (id, user_id, name, created_at, updated_at)
     values ($1, $2, $3, now(), now())`,
    [wordbookId, fixture.actorUserId, `병합-${wordbookId}`],
  );
  await pool.query(
    `insert into wordbook_items (wordbook_id, vocabulary_id, added_at)
     values ($1, $2, $3), ($1, $4, $5)`,
    [
      wordbookId,
      fixture.sourceVocabularyId,
      sourceAddedAt,
      fixture.representativeVocabularyId,
      representativeAddedAt,
    ],
  );
  await pool.query(
    `insert into vocabulary_practice_answers (
       id, session_id, question_id, user_id, client_answer_id,
       selected_option_id, selected_label_snapshot, is_correct, answered_at
     ) values ($1, $2, $3, $4, $5, $6, '원본 뜻', true, now())`,
    [
      practiceAnswerId,
      practice.sessionId,
      practice.practiceQuestionId,
      fixture.actorUserId,
      randomUUID(),
      practice.correctOptionId,
    ],
  );
  await pool.query(
    `insert into vocabulary_meaning_relations (
       id, source_meaning_id, target_meaning_id, type, direction, status
     ) values ($1, $2, $3, 'RELATED', 'DIRECTED', 'PASSED')`,
    [randomUUID(), fixture.sourceMeaningId, fixture.representativeMeaningId],
  );

  return {
    practiceAnswerId,
    practiceQuestionId: practice.practiceQuestionId,
    representativeAddedAt,
    representativeSavedAt,
    sourceAddedAt,
    sourceSavedAt,
    wordbookId,
  };
};

describe.runIf(databaseUrl !== undefined)(
  'DrizzleVocabularyAdminRepository 안전 병합 PostgreSQL',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error('VOCABULARY_MERGE_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{ name: string | null }>(
        `select to_regclass('vocabulary_merge_history')::text as name`,
      );
      if (!migration.rows[0]?.name) {
        throw new Error('어휘 병합 migration이 적용된 격리 DB가 필요합니다.');
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    it('모든 live 참조를 대표 어휘로 옮기고 중복 membership의 최초 시각과 snapshot을 보존한다', async () => {
      const fixture = await createMergeFixture(pool);
      const references = await addLiveReferences(pool, fixture);
      const service = createService(pool);
      const preview = await service.previewMerge(
        fixture.sourceVocabularyId,
        fixture.representativeVocabularyId,
      );

      await expect(
        service.merge({
          sourceVocabularyId: fixture.sourceVocabularyId,
          representativeVocabularyId: fixture.representativeVocabularyId,
          mergeToken: preview.mergeToken,
          ...contextFor(fixture),
        }),
      ).resolves.toEqual({
        sourceVocabularyId: fixture.sourceVocabularyId,
        representativeVocabularyId: fixture.representativeVocabularyId,
        movedCounts: {
          meanings: 1,
          pronunciations: 1,
          meaningPronunciations: 1,
          tokenOccurrences: 1,
          expressionOccurrences: 1,
          savedMemberships: 1,
          wordbookMemberships: 1,
          practiceQuestions: 1,
        },
      });

      const graph = await pool.query<{
        expressionVocabularyId: string;
        auditCount: string;
        historyMovedCounts: Record<string, number>;
        mappingVocabularyId: string;
        meaningVocabularyId: string;
        practiceCard: { immutable: string };
        practiceVocabularyId: string;
        pronunciationVocabularyId: string;
        relationCount: string;
        sourceMergedInto: string;
        sourceStatus: string;
        tokenVocabularyId: string;
      }>(
        `select
           (select vocabulary_id from vocabulary_meanings where id = $1) "meaningVocabularyId",
           (select vocabulary_id from vocabulary_pronunciations where id = $2) "pronunciationVocabularyId",
           (select vocabulary_id from vocabulary_meaning_pronunciations where meaning_id = $1) "mappingVocabularyId",
           (select vocabulary_id from token_occurrences where meaning_id = $1) "tokenVocabularyId",
           (select vocabulary_id from expression_occurrences where meaning_id = $1) "expressionVocabularyId",
           (select vocabulary_id from vocabulary_practice_questions where id = $3) "practiceVocabularyId",
           (select card_snapshot from vocabulary_practice_questions where id = $3) "practiceCard",
           (select count(*)::text from vocabulary_meaning_relations
             where source_meaning_id = $1 and target_meaning_id = $5) "relationCount",
           (select moved_counts from vocabulary_merge_history
             where source_vocabulary_id = $4) "historyMovedCounts",
           (select count(*)::text from audit_logs
             where target_id = $4 and action = 'VOCABULARY_MERGED') "auditCount",
           status "sourceStatus",
           merged_into_vocabulary_id "sourceMergedInto"
         from vocabularies where id = $4`,
        [
          fixture.sourceMeaningId,
          fixture.sourcePronunciationId,
          references.practiceQuestionId,
          fixture.sourceVocabularyId,
          fixture.representativeMeaningId,
        ],
      );
      expect(graph.rows[0]).toEqual({
        auditCount: '1',
        expressionVocabularyId: fixture.representativeVocabularyId,
        historyMovedCounts: {
          expressionOccurrences: 1,
          meaningPronunciations: 1,
          meanings: 1,
          practiceQuestions: 1,
          pronunciations: 1,
          savedMemberships: 1,
          tokenOccurrences: 1,
          wordbookMemberships: 1,
        },
        mappingVocabularyId: fixture.representativeVocabularyId,
        meaningVocabularyId: fixture.representativeVocabularyId,
        practiceCard: { immutable: '원본 snapshot' },
        practiceVocabularyId: fixture.representativeVocabularyId,
        pronunciationVocabularyId: fixture.representativeVocabularyId,
        relationCount: '1',
        sourceMergedInto: fixture.representativeVocabularyId,
        sourceStatus: 'MERGED',
        tokenVocabularyId: fixture.representativeVocabularyId,
      });
      const memberships = await pool.query<{
        addedAt: Date;
        answerCount: string;
        savedAt: Date;
        savedCount: string;
        wordbookCount: string;
      }>(
        `select
           (select count(*)::text from saved_vocabularies
             where user_id = $1 and vocabulary_id in ($2, $3)) "savedCount",
           (select saved_at from saved_vocabularies
             where user_id = $1 and vocabulary_id = $3) "savedAt",
           (select count(*)::text from wordbook_items
             where wordbook_id = $4 and vocabulary_id in ($2, $3)) "wordbookCount",
           (select added_at from wordbook_items
             where wordbook_id = $4 and vocabulary_id = $3) "addedAt",
           (select count(*)::text from vocabulary_practice_answers
             where id = $5) "answerCount"`,
        [
          fixture.actorUserId,
          fixture.sourceVocabularyId,
          fixture.representativeVocabularyId,
          references.wordbookId,
          references.practiceAnswerId,
        ],
      );
      expect(memberships.rows[0]).toMatchObject({
        answerCount: '1',
        savedCount: '1',
        wordbookCount: '1',
      });
      expect(memberships.rows[0]?.savedAt.toISOString()).toBe(
        references.sourceSavedAt,
      );
      expect(memberships.rows[0]?.addedAt.toISOString()).toBe(
        references.sourceAddedAt,
      );
      expect(references.sourceSavedAt < references.representativeSavedAt).toBe(
        true,
      );
      expect(references.sourceAddedAt < references.representativeAddedAt).toBe(
        true,
      );
    });

    it('preview 이후 wordbook graph가 바뀌면 stale token을 거부하고 기존 graph를 그대로 둔다', async () => {
      const fixture = await createMergeFixture(pool);
      const service = createService(pool);
      const preview = await service.previewMerge(
        fixture.sourceVocabularyId,
        fixture.representativeVocabularyId,
      );
      const wordbookId = randomUUID();
      await pool.query(
        `insert into wordbooks (id, user_id, name, created_at, updated_at)
         values ($1, $2, $3, now(), now())`,
        [wordbookId, fixture.actorUserId, `stale-${wordbookId}`],
      );
      await pool.query(
        `insert into wordbook_items (wordbook_id, vocabulary_id, added_at)
         values ($1, $2, now())`,
        [wordbookId, fixture.sourceVocabularyId],
      );

      await expect(
        service.merge({
          sourceVocabularyId: fixture.sourceVocabularyId,
          representativeVocabularyId: fixture.representativeVocabularyId,
          mergeToken: preview.mergeToken,
          ...contextFor(fixture),
        }),
      ).rejects.toEqual(
        new VocabularyRelationsMergeAdminError('VOCABULARY_MERGE_CONFLICT'),
      );
      const stored = await pool.query<{
        histories: string;
        meaningVocabularyId: string;
        sourceStatus: string;
        wordbookVocabularyId: string;
      }>(
        `select
           status "sourceStatus",
           (select vocabulary_id from vocabulary_meanings where id = $2) "meaningVocabularyId",
           (select vocabulary_id from wordbook_items
             where wordbook_id = $3) "wordbookVocabularyId",
           (select count(*)::text from vocabulary_merge_history
             where source_vocabulary_id = $1) "histories"
         from vocabularies where id = $1`,
        [fixture.sourceVocabularyId, fixture.sourceMeaningId, wordbookId],
      );
      expect(stored.rows[0]).toEqual({
        histories: '0',
        meaningVocabularyId: fixture.sourceVocabularyId,
        sourceStatus: 'DRAFT',
        wordbookVocabularyId: fixture.sourceVocabularyId,
      });
    });

    it('preview 이후 token occurrence가 추가되면 stale token을 거부하고 source와 child를 그대로 둔다', async () => {
      const fixture = await createMergeFixture(pool);
      const service = createService(pool);
      const preview = await service.previewMerge(
        fixture.sourceVocabularyId,
        fixture.representativeVocabularyId,
      );
      const token = await addTokenOccurrence(pool, fixture);

      await expect(
        service.merge({
          sourceVocabularyId: fixture.sourceVocabularyId,
          representativeVocabularyId: fixture.representativeVocabularyId,
          mergeToken: preview.mergeToken,
          ...contextFor(fixture),
        }),
      ).rejects.toEqual(
        new VocabularyRelationsMergeAdminError('VOCABULARY_MERGE_CONFLICT'),
      );
      const stored = await pool.query<{
        audits: string;
        histories: string;
        meaningVocabularyId: string;
        mergedInto: string | null;
        pronunciationVocabularyId: string;
        sourceStatus: string;
        tokenVocabularyId: string;
      }>(
        `select
           status "sourceStatus",
           merged_into_vocabulary_id "mergedInto",
           (select vocabulary_id from vocabulary_meanings where id = $2) "meaningVocabularyId",
           (select vocabulary_id from vocabulary_pronunciations where id = $3) "pronunciationVocabularyId",
           (select vocabulary_id from token_occurrences where id = $4) "tokenVocabularyId",
           (select count(*)::text from vocabulary_merge_history
             where source_vocabulary_id = $1) "histories",
           (select count(*)::text from audit_logs
             where target_id = $1 and action = 'VOCABULARY_MERGED') "audits"
         from vocabularies where id = $1`,
        [
          fixture.sourceVocabularyId,
          fixture.sourceMeaningId,
          fixture.sourcePronunciationId,
          token.tokenId,
        ],
      );
      expect(stored.rows[0]).toEqual({
        audits: '0',
        histories: '0',
        meaningVocabularyId: fixture.sourceVocabularyId,
        mergedInto: null,
        pronunciationVocabularyId: fixture.sourceVocabularyId,
        sourceStatus: 'DRAFT',
        tokenVocabularyId: fixture.sourceVocabularyId,
      });
    });

    it('preview 이후 practice question이 추가되면 stale token을 거부하고 source와 child를 그대로 둔다', async () => {
      const fixture = await createMergeFixture(pool);
      const service = createService(pool);
      const preview = await service.previewMerge(
        fixture.sourceVocabularyId,
        fixture.representativeVocabularyId,
      );
      const practice = await addPracticeQuestion(pool, fixture);

      await expect(
        service.merge({
          sourceVocabularyId: fixture.sourceVocabularyId,
          representativeVocabularyId: fixture.representativeVocabularyId,
          mergeToken: preview.mergeToken,
          ...contextFor(fixture),
        }),
      ).rejects.toEqual(
        new VocabularyRelationsMergeAdminError('VOCABULARY_MERGE_CONFLICT'),
      );
      const stored = await pool.query<{
        audits: string;
        histories: string;
        meaningVocabularyId: string;
        mergedInto: string | null;
        practiceVocabularyId: string;
        pronunciationVocabularyId: string;
        sourceStatus: string;
      }>(
        `select
           status "sourceStatus",
           merged_into_vocabulary_id "mergedInto",
           (select vocabulary_id from vocabulary_meanings where id = $2) "meaningVocabularyId",
           (select vocabulary_id from vocabulary_pronunciations where id = $3) "pronunciationVocabularyId",
           (select vocabulary_id from vocabulary_practice_questions
             where id = $4) "practiceVocabularyId",
           (select count(*)::text from vocabulary_merge_history
             where source_vocabulary_id = $1) "histories",
           (select count(*)::text from audit_logs
             where target_id = $1 and action = 'VOCABULARY_MERGED') "audits"
         from vocabularies where id = $1`,
        [
          fixture.sourceVocabularyId,
          fixture.sourceMeaningId,
          fixture.sourcePronunciationId,
          practice.practiceQuestionId,
        ],
      );
      expect(stored.rows[0]).toEqual({
        audits: '0',
        histories: '0',
        meaningVocabularyId: fixture.sourceVocabularyId,
        mergedInto: null,
        practiceVocabularyId: fixture.sourceVocabularyId,
        pronunciationVocabularyId: fixture.sourceVocabularyId,
        sourceStatus: 'DRAFT',
      });
    });

    it('preview 뒤 대표 어휘가 MERGED가 되면 source를 건드리지 않고 stable conflict로 거부한다', async () => {
      const fixture = await createMergeFixture(pool);
      const nextRepresentative = await createMergeFixture(pool);
      const service = createService(pool);
      const preview = await service.previewMerge(
        fixture.sourceVocabularyId,
        fixture.representativeVocabularyId,
      );
      await pool.query(
        `update vocabularies
         set status = 'MERGED', merged_into_vocabulary_id = $2
         where id = $1`,
        [
          fixture.representativeVocabularyId,
          nextRepresentative.representativeVocabularyId,
        ],
      );

      await expect(
        service.merge({
          sourceVocabularyId: fixture.sourceVocabularyId,
          representativeVocabularyId: fixture.representativeVocabularyId,
          mergeToken: preview.mergeToken,
          ...contextFor(fixture),
        }),
      ).rejects.toEqual(
        new VocabularyRelationsMergeAdminError('VOCABULARY_MERGE_CONFLICT'),
      );
      const stored = await pool.query<{
        histories: string;
        representativeMergedInto: string;
        representativeStatus: string;
        sourceMeaningVocabularyId: string;
        sourceStatus: string;
      }>(
        `select
           source.status "sourceStatus",
           representative.status "representativeStatus",
           representative.merged_into_vocabulary_id "representativeMergedInto",
           (select vocabulary_id from vocabulary_meanings where id = $3) "sourceMeaningVocabularyId",
           (select count(*)::text from vocabulary_merge_history
             where source_vocabulary_id = $1) "histories"
         from vocabularies source
         join vocabularies representative on representative.id = $2
         where source.id = $1`,
        [
          fixture.sourceVocabularyId,
          fixture.representativeVocabularyId,
          fixture.sourceMeaningId,
        ],
      );
      expect(stored.rows[0]).toEqual({
        histories: '0',
        representativeMergedInto: nextRepresentative.representativeVocabularyId,
        representativeStatus: 'MERGED',
        sourceMeaningVocabularyId: fixture.sourceVocabularyId,
        sourceStatus: 'DRAFT',
      });
    });

    it('병합 이력 FK가 실패하면 앞선 live 참조 이동을 전부 rollback한다', async () => {
      const fixture = await createMergeFixture(pool);
      const repository = new DrizzleVocabularyAdminRepository(
        drizzle({ client: pool, schema }),
      );
      const service = new VocabularyRelationsMergeService(repository);
      const preview = await service.previewMerge(
        fixture.sourceVocabularyId,
        fixture.representativeVocabularyId,
      );

      await expect(
        repository.executeMerge({
          sourceVocabularyId: fixture.sourceVocabularyId,
          representativeVocabularyId: fixture.representativeVocabularyId,
          expectedFingerprint: preview.mergeToken,
          actorSub: 'missing-actor',
          actorUserId: randomUUID(),
          requestId: `rollback-${randomUUID()}`,
          occurredAt: new Date('2026-07-27T10:00:00.000Z'),
        }),
      ).rejects.toBeDefined();
      const stored = await pool.query<{
        histories: string;
        meaningVocabularyId: string;
        sourceStatus: string;
      }>(
        `select
           status "sourceStatus",
           (select vocabulary_id from vocabulary_meanings where id = $2) "meaningVocabularyId",
           (select count(*)::text from vocabulary_merge_history
             where source_vocabulary_id = $1) "histories"
         from vocabularies where id = $1`,
        [fixture.sourceVocabularyId, fixture.sourceMeaningId],
      );
      expect(stored.rows[0]).toEqual({
        histories: '0',
        meaningVocabularyId: fixture.sourceVocabularyId,
        sourceStatus: 'DRAFT',
      });
    });

    it('동일 preview의 동시 병합은 한 요청만 commit하고 나머지는 stable conflict다', async () => {
      const fixture = await createMergeFixture(pool);
      const first = createService(pool);
      const second = createService(pool);
      const preview = await first.previewMerge(
        fixture.sourceVocabularyId,
        fixture.representativeVocabularyId,
      );
      const command = {
        sourceVocabularyId: fixture.sourceVocabularyId,
        representativeVocabularyId: fixture.representativeVocabularyId,
        mergeToken: preview.mergeToken,
        ...contextFor(fixture),
      };

      const results = await Promise.allSettled([
        first.merge(command),
        second.merge({ ...command, requestId: `merge-${randomUUID()}` }),
      ]);

      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(results.find(({ status }) => status === 'rejected')).toMatchObject(
        {
          status: 'rejected',
          reason: { code: 'VOCABULARY_MERGE_CONFLICT' },
        },
      );
      const committed = await pool.query<{
        audits: string;
        histories: string;
        status: string;
      }>(
        `select status,
           (select count(*)::text from vocabulary_merge_history
             where source_vocabulary_id = $1) "histories",
           (select count(*)::text from audit_logs
             where target_id = $1 and action = 'VOCABULARY_MERGED') "audits"
         from vocabularies where id = $1`,
        [fixture.sourceVocabularyId],
      );
      expect(committed.rows[0]).toEqual({
        audits: '1',
        histories: '1',
        status: 'MERGED',
      });
    });

    it('역방향 동시 병합은 deadlock 없이 한 방향만 commit하고 반대 방향은 stable conflict다', async () => {
      const fixture = await createMergeFixture(pool);
      await pool.query(
        `update vocabularies
         set status = 'PUBLISHED', published_at = now()
         where id = $1`,
        [fixture.sourceVocabularyId],
      );
      const forward = createService(pool);
      const reverse = createService(pool);
      const [forwardPreview, reversePreview] = await Promise.all([
        forward.previewMerge(
          fixture.sourceVocabularyId,
          fixture.representativeVocabularyId,
        ),
        reverse.previewMerge(
          fixture.representativeVocabularyId,
          fixture.sourceVocabularyId,
        ),
      ]);
      const forwardCommand = {
        sourceVocabularyId: fixture.sourceVocabularyId,
        representativeVocabularyId: fixture.representativeVocabularyId,
        mergeToken: forwardPreview.mergeToken,
        ...contextFor(fixture),
      };
      const reverseCommand = {
        sourceVocabularyId: fixture.representativeVocabularyId,
        representativeVocabularyId: fixture.sourceVocabularyId,
        mergeToken: reversePreview.mergeToken,
        ...contextFor(fixture),
        requestId: `reverse-${randomUUID()}`,
      };

      const results = await Promise.allSettled([
        forward.merge(forwardCommand),
        reverse.merge(reverseCommand),
      ]);

      const fulfilled = results.find((result) => result.status === 'fulfilled');
      if (!fulfilled || fulfilled.status !== 'fulfilled') {
        throw new Error('역방향 병합 중 한 요청은 성공해야 합니다.');
      }
      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(results.find(({ status }) => status === 'rejected')).toMatchObject(
        {
          status: 'rejected',
          reason: { code: 'VOCABULARY_MERGE_CONFLICT' },
        },
      );
      const stored = await pool.query<{
        audits: string;
        histories: string;
        mergedInto: string | null;
        sourceVocabularyId: string;
        status: string;
      }>(
        `select
           vocabulary_merge_history.source_vocabulary_id "sourceVocabularyId",
           source.status,
           source.merged_into_vocabulary_id "mergedInto",
           (select count(*)::text from vocabulary_merge_history
             where source_vocabulary_id in ($1, $2)) "histories",
           (select count(*)::text from audit_logs
             where target_id in ($1, $2)
               and action = 'VOCABULARY_MERGED') "audits"
         from vocabulary_merge_history
         join vocabularies source
           on source.id = vocabulary_merge_history.source_vocabulary_id
         where vocabulary_merge_history.source_vocabulary_id in ($1, $2)`,
        [fixture.sourceVocabularyId, fixture.representativeVocabularyId],
      );
      expect(stored.rows[0]).toEqual({
        audits: '1',
        histories: '1',
        mergedInto: fulfilled?.value.representativeVocabularyId,
        sourceVocabularyId: fulfilled?.value.sourceVocabularyId,
        status: 'MERGED',
      });
      const representative = await pool.query<{
        mergedInto: string | null;
        status: string;
      }>(
        `select status, merged_into_vocabulary_id "mergedInto"
         from vocabularies where id = $1`,
        [fulfilled?.value.representativeVocabularyId],
      );
      expect(representative.rows[0]).toEqual({
        mergedInto: null,
        status: 'PUBLISHED',
      });
    });
  },
);

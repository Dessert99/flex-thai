/** Wave 5 단일 migration의 보존·제약·snapshot 연속성을 검증한다 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationDirectory = new URL('../../drizzle/', import.meta.url);
const metadataDirectory = new URL('../../drizzle/meta/', import.meta.url);
const migrationName = '0016_wave5_question_tts.sql';
const migrationSql = readFileSync(
  new URL(migrationName, migrationDirectory),
  'utf8',
);
const journal = JSON.parse(
  readFileSync(new URL('_journal.json', metadataDirectory), 'utf8'),
) as { entries: Array<{ idx: number; tag: string }> };
const previousSnapshot = JSON.parse(
  readFileSync(new URL('0015_snapshot.json', metadataDirectory), 'utf8'),
) as { id: string };
const currentSnapshot = JSON.parse(
  readFileSync(new URL('0016_snapshot.json', metadataDirectory), 'utf8'),
) as {
  prevId: string;
  tables: Record<string, { columns: Record<string, { notNull: boolean }> }>;
};

describe('Wave 5 통합 migration', () => {
  it('0015 다음 journal과 snapshot을 단일 0016 migration으로 잇는다', () => {
    expect(
      readdirSync(migrationDirectory).filter((file) =>
        /^0016_.+\.sql$/u.test(file),
      ),
    ).toEqual([migrationName]);
    expect(
      journal.entries.find(({ tag }) => tag === '0016_wave5_question_tts'),
    ).toMatchObject({
      idx: 16,
      tag: '0016_wave5_question_tts',
    });
    expect(currentSnapshot.prevId).toBe(previousSnapshot.id);
  });

  it('AI 문제와 TTS·공용 outbox 내구성 table을 함께 만든다', () => {
    [
      'question_production_candidates',
      'question_production_validations',
      'tts_voice_presets',
      'tts_jobs',
      'tts_items',
      'tts_audio_cache',
      'tts_provider_runs',
      'tts_audio_gc_records',
      'async_dispatch_outbox',
    ].forEach((table) =>
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`),
    );
  });

  it('생성 문장 media를 nullable로 전환하되 기존 게시 데이터를 다시 쓰지 않는다', () => {
    expect(migrationSql).toContain(
      'ALTER TABLE "thai_sentence_versions" ALTER COLUMN "media_asset_id" DROP NOT NULL',
    );
    expect(
      currentSnapshot.tables['public.thai_sentence_versions']?.columns
        .media_asset_id?.notNull,
    ).toBe(false);
    expect(migrationSql).not.toMatch(
      /(?:^|statement-breakpoint\n)(?:update|delete from|truncate)\b/iu,
    );
    expect(migrationSql).not.toMatch(/\bdrop\s+(?:table|column|type)\b/iu);
  });

  it('AI candidate의 식별·검증 uniqueness와 redacted nullable 표현을 강제한다', () => {
    expect(migrationSql).toContain(
      'question_production_candidates_item_attempt_ordinal_unique',
    );
    expect(migrationSql).toContain(
      'question_production_validations_candidate_stage_unique',
    );
    expect(migrationSql).toContain(
      '"payload_state" = \'REDACTED_INVALID\' and "question_production_candidates"."topic_id" is null',
    );
    expect(migrationSql).toContain(
      '"question_production_candidates"."difficulty" is null',
    );
    expect(migrationSql).toContain(
      '"question_production_candidates"."payload" is null',
    );
  });

  it('TTS cache·provider run·GC와 outbox의 replay key를 유일하게 만든다', () => {
    [
      'tts_audio_cache_cache_key_unique',
      'tts_provider_runs_item_attempt_unique',
      'tts_audio_gc_records_storage_key_unique',
      'async_dispatch_outbox_idempotency_key_unique',
      'async_dispatch_outbox_execution_unique',
    ].forEach((constraint) => expect(migrationSql).toContain(constraint));
  });

  it('Wave 5 관계와 상태별 일관성 check를 migration에 보존한다', () => {
    [
      'question_production_candidates_approved_question_version_fk',
      'question_production_validations_candidate_id_question_production_candidates_id_fk',
      'tts_items_job_id_tts_jobs_id_fk',
      'tts_jobs_requested_by_users_id_fk',
      'tts_provider_runs_item_id_tts_items_id_fk',
      'question_production_candidates_payload_representation_consistency',
      'tts_audio_cache_ready_metadata_consistent',
      'tts_provider_runs_storage_metadata_consistent',
      'tts_provider_runs_terminal_consistent',
      'tts_audio_gc_records_terminal_consistent',
      'async_dispatch_outbox_lease_pair_consistent',
    ].forEach((constraint) => expect(migrationSql).toContain(constraint));
  });
});

/** Wave 5 단일 migration의 보존·제약·snapshot 연속성을 검증한다 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationDirectory = new URL('../../drizzle/', import.meta.url);
const metadataDirectory = new URL('../../drizzle/meta/', import.meta.url);
const migrationName = '0016_question_production.sql';
const migrationSql = readFileSync(
  new URL(migrationName, migrationDirectory),
  'utf8',
);

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
    expect(currentSnapshot.prevId).toBe(previousSnapshot.id);
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

  it('Wave 5 관계와 상태별 일관성 check를 migration에 보존한다', () => {
    [
      'question_production_candidates_approved_question_version_fk',
      'question_production_validations_candidate_id_question_production_candidates_id_fk',
      'question_production_candidates_payload_representation_consistency',
      'async_dispatch_outbox_lease_pair_consistent',
    ].forEach((constraint) => expect(migrationSql).toContain(constraint));
  });
});

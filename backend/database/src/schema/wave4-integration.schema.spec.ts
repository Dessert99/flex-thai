/** Wave 4 통합 migration의 backfill 순서와 snapshot 연속성을 검증한다 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationDirectory = new URL('../../drizzle/', import.meta.url);
const metadataDirectory = new URL('../../drizzle/meta/', import.meta.url);
const migrationSql = readFileSync(
  new URL('0015_jazzy_red_hulk.sql', migrationDirectory),
  'utf8',
);
const journal = JSON.parse(
  readFileSync(new URL('_journal.json', metadataDirectory), 'utf8'),
) as { entries: Array<{ idx: number; tag: string }> };
const previousSnapshot = JSON.parse(
  readFileSync(new URL('0014_snapshot.json', metadataDirectory), 'utf8'),
) as { id: string };
const currentSnapshot = JSON.parse(
  readFileSync(new URL('0015_snapshot.json', metadataDirectory), 'utf8'),
) as {
  prevId: string;
  tables: Record<string, { columns: Record<string, { notNull: boolean }> }>;
};

describe('Wave 4 통합 migration', () => {
  it('journal과 snapshot이 0014 다음 0015로 끊김 없이 이어진다', () => {
    expect(journal.entries.find(({ idx }) => idx === 15)).toMatchObject({
      idx: 15,
      tag: '0015_jazzy_red_hulk',
    });
    expect(currentSnapshot.prevId).toBe(previousSnapshot.id);
  });

  it('콘텐츠 제작 항목을 입력과 작업에 연결한 뒤 필수 column으로 전환한다', () => {
    const backfillIndex = migrationSql.indexOf('UPDATE "job_items"');
    const inputNotNullIndex = migrationSql.indexOf(
      'ALTER TABLE "job_items" ALTER COLUMN "job_input_id" SET NOT NULL',
    );
    const operationNotNullIndex = migrationSql.indexOf(
      'ALTER TABLE "job_items" ALTER COLUMN "operation" SET NOT NULL',
    );

    expect(backfillIndex).toBeGreaterThan(-1);
    expect(migrationSql).toContain('FROM "job_inputs"');
    expect(migrationSql).toContain(
      `substring(ji."source_ref" from '^input:([0-9]+):(vocabulary|question)$')::integer`,
    );
    expect(migrationSql).toContain(
      `'VOCABULARY_EXTRACTION'::"content_production_operation"`,
    );
    expect(migrationSql).toContain(
      `'QUESTION_GENERATION'::"content_production_operation"`,
    );
    expect(inputNotNullIndex).toBeGreaterThan(backfillIndex);
    expect(operationNotNullIndex).toBeGreaterThan(backfillIndex);
    expect(
      currentSnapshot.tables['public.job_items']?.columns.job_input_id?.notNull,
    ).toBe(true);
    expect(
      currentSnapshot.tables['public.job_items']?.columns.operation?.notNull,
    ).toBe(true);
  });

  it('기존 provider 결과와 AI 중복 정책을 보존한다', () => {
    expect(migrationSql).toMatch(
      /UPDATE "provider_runs"[\s\S]+WHEN "success" IS TRUE THEN 'SUCCEEDED'[\s\S]+WHEN "success" IS FALSE THEN 'FAILED'/u,
    );
    expect(migrationSql).toMatch(
      /UPDATE "content_production_presets"[\s\S]+suspectedDuplicateMaxCodePointDistance[\s\S]+00000000-0000-4000-8000-000000000901[\s\S]+00000000-0000-4000-8000-000000000903/u,
    );
    expect(migrationSql).toContain(
      'provider_runs_item_attempt_operation_sequence_unique',
    );
  });

  it('기존 문제 분류와 주제를 backfill한 뒤 필수 column으로 전환한다', () => {
    const topicSeedIndex = migrationSql.indexOf(
      'INSERT INTO "question_topics"',
    );
    const topicUniqueIndex = migrationSql.indexOf(
      'CREATE UNIQUE INDEX "question_topics_slug_unique"',
    );
    const categoryBackfillIndex = migrationSql.indexOf(
      'UPDATE "question_types"',
    );
    const topicBackfillIndex = migrationSql.indexOf(
      'UPDATE "question_versions"',
    );
    const categoryNotNullIndex = migrationSql.indexOf(
      'ALTER TABLE "question_types" ALTER COLUMN "major_category" SET NOT NULL',
    );
    const topicNotNullIndex = migrationSql.indexOf(
      'ALTER TABLE "question_versions" ALTER COLUMN "topic_id" SET NOT NULL',
    );

    expect(topicSeedIndex).toBeGreaterThan(-1);
    expect(
      migrationSql.slice(topicSeedIndex, categoryBackfillIndex),
    ).not.toContain('ON CONFLICT ("slug")');
    expect(topicUniqueIndex).toBeGreaterThan(topicSeedIndex);
    expect(categoryBackfillIndex).toBeGreaterThan(-1);
    expect(topicBackfillIndex).toBeGreaterThan(-1);
    expect(categoryNotNullIndex).toBeGreaterThan(categoryBackfillIndex);
    expect(topicNotNullIndex).toBeGreaterThan(topicBackfillIndex);
  });

  it('검증을 통과한 legacy 유형의 최신 버전을 난이도 기준과 함께 활성 보존한다', () => {
    const criteriaIndex = migrationSql.indexOf(
      'INSERT INTO "question_type_difficulty_criteria"',
    );
    const activationIndex = migrationSql.indexOf(
      `SET "status" = 'ACTIVE'::"question_type_version_status"`,
    );
    const activeIndex = migrationSql.indexOf(
      'question_type_versions_one_active_per_type',
    );

    expect(migrationSql).toContain(`"validation_status" = 'PASSED'`);
    expect(migrationSql).toContain('DISTINCT ON (qtv."question_type_id")');
    expect(criteriaIndex).toBeGreaterThan(-1);
    expect(activationIndex).toBeGreaterThan(criteriaIndex);
    expect(activeIndex).toBeGreaterThan(activationIndex);
  });
});

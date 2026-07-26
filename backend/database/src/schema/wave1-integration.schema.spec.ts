/** Wave 1 병합 schema migration의 보존·backfill·release gate를 검증한다 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationDirectory = new URL('../../drizzle/', import.meta.url);
const integrationMigrations = readdirSync(migrationDirectory).filter((file) =>
  /^0007_.+\.sql$/u.test(file),
);
const migrationPath =
  integrationMigrations.length === 1
    ? new URL(integrationMigrations[0]!, migrationDirectory)
    : null;
const migrationSql =
  migrationPath === null ? '' : readFileSync(migrationPath, 'utf8');
const releaseGatePath = new URL(
  '../../drizzle/WAVE1_SAVED_VOCABULARY_CUTOVER.md',
  import.meta.url,
);

describe('Wave 1 병합 migration', () => {
  it('merged schema를 한 순차 migration으로 추가한다', () => {
    expect(integrationMigrations).toHaveLength(1);
    if (migrationSql.length === 0) return;

    expect(migrationSql).toContain('CREATE TABLE "wordbooks"');
    expect(migrationSql).toContain('CREATE TABLE "wordbook_items"');
    expect(migrationSql).toContain('"email_challenge_status"');
    expect(migrationSql).toContain('"email_challenge_delivery_status"');
    expect(migrationSql).toContain('"span_sentence_version_id"');
    expect(migrationSql).toContain('"question_options_sentence_or_span"');
    expect(migrationSql).toContain(
      '"expression_occurrences_meaning_vocabulary_fk"',
    );
    expect(migrationSql).toContain(
      '"expression_occurrences_pronunciation_vocabulary_fk"',
    );
  });

  it('legacy 저장 시각을 보존하고 row count와 누락 0건을 검증한다', () => {
    expect(integrationMigrations).toHaveLength(1);
    if (migrationSql.length === 0) return;

    expect(migrationSql).toContain("'저장한 어휘'");
    expect(migrationSql).toMatch(
      /insert into "wordbooks"[\s\S]+min\(sv\."saved_at"\)[\s\S]+max\(sv\."saved_at"\)/iu,
    );
    expect(migrationSql).toMatch(
      /insert into "wordbook_items"[\s\S]+sv\."saved_at"/iu,
    );
    expect(migrationSql).toContain('legacy_saved_count');
    expect(migrationSql).toContain('migrated_item_count');
    expect(migrationSql).toContain('missing_item_count');
    expect(migrationSql).toMatch(/raise exception/iu);
    expect(migrationSql).not.toMatch(
      /drop\s+table\s+(?:if\s+exists\s+)?"saved_vocabularies"/iu,
    );
  });

  it('endpoint 전환 전에 legacy write 정지와 catch-up 검증을 요구한다', () => {
    expect(existsSync(releaseGatePath)).toBe(true);
    if (!existsSync(releaseGatePath)) return;

    const releaseGate = readFileSync(releaseGatePath, 'utf8');
    expect(releaseGate).toContain('write quiescence');
    expect(releaseGate).toContain('catch-up');
    expect(releaseGate).toContain('missing_item_count = 0');
    expect(releaseGate).toContain('endpoint cutover');
  });
});

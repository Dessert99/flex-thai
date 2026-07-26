/** Wave 1 병합 schema migration의 보존·backfill·release gate를 검증한다 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationDirectory = new URL('../../drizzle/', import.meta.url);
const integrationMigrationNames = [
  '0007_wave1-identity-challenge.sql',
  '0008_wave1-thai-interactions.sql',
  '0009_wave1-wordbooks.sql',
] as const;
const integrationMigrationSql = integrationMigrationNames.map((name) => {
  const path = new URL(name, migrationDirectory);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
});
const [identityMigrationSql, thaiMigrationSql, wordbookMigrationSql] =
  integrationMigrationSql;
const releaseGatePath = new URL(
  '../../drizzle/WAVE1_SAVED_VOCABULARY_CUTOVER.md',
  import.meta.url,
);
const cutoverSqlPath = new URL(
  '../../drizzle/operations/wave1-saved-vocabulary-cutover.sql',
  import.meta.url,
);
const legacyFixturePath = new URL(
  '../../test-fixtures/wave1-legacy-saved-vocabulary.sql',
  import.meta.url,
);
const databaseVerificationPath = new URL(
  '../../drizzle/WAVE1_DATABASE_VERIFICATION.md',
  import.meta.url,
);

const readSnapshot = (
  metadataDirectory: URL,
  index: number,
): {
  id: string;
  prevId: string;
  tables: Record<string, { columns: Record<string, unknown> }>;
} =>
  JSON.parse(
    readFileSync(
      new URL(
        `${String(index).padStart(4, '0')}_snapshot.json`,
        metadataDirectory,
      ),
      'utf8',
    ),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, { columns: Record<string, unknown> }>;
  };

describe('Wave 1 병합 migration', () => {
  it('merged schema를 한 순차 migration으로 추가한다', () => {
    const migrationFiles = readdirSync(migrationDirectory).filter((file) =>
      /^000[789]_.+\.sql$/u.test(file),
    );
    expect(migrationFiles.sort()).toEqual([...integrationMigrationNames]);
    expect(identityMigrationSql).toContain('"email_challenge_status"');
    expect(identityMigrationSql).toContain('"email_challenge_delivery_status"');
    expect(identityMigrationSql).not.toContain('expression_occurrences');
    expect(identityMigrationSql).not.toContain('wordbooks');

    expect(thaiMigrationSql).toContain('"span_sentence_version_id"');
    expect(thaiMigrationSql).toContain('"question_options_sentence_or_span"');
    expect(thaiMigrationSql).toContain(
      '"expression_occurrences_meaning_vocabulary_fk"',
    );
    expect(thaiMigrationSql).toContain(
      '"expression_occurrences_pronunciation_vocabulary_fk"',
    );
    expect(thaiMigrationSql).not.toContain('auth_challenges');
    expect(thaiMigrationSql).not.toContain('wordbooks');

    expect(wordbookMigrationSql).toContain('CREATE TABLE "wordbooks"');
    expect(wordbookMigrationSql).toContain('CREATE TABLE "wordbook_items"');
    expect(wordbookMigrationSql).not.toContain('auth_challenges');
    expect(wordbookMigrationSql).not.toContain('expression_occurrences');
  });

  it('legacy 저장 시각을 보존하고 row count와 누락 0건을 검증한다', () => {
    expect(wordbookMigrationSql).toContain("'저장한 어휘'");
    expect(wordbookMigrationSql).toMatch(
      /insert into "wordbooks"[\s\S]+min\(sv\."saved_at"\)[\s\S]+max\(sv\."saved_at"\)/iu,
    );
    expect(wordbookMigrationSql).toMatch(
      /insert into "wordbook_items"[\s\S]+sv\."saved_at"/iu,
    );
    expect(wordbookMigrationSql).toContain('legacy_saved_count');
    expect(wordbookMigrationSql).toContain('migrated_item_count');
    expect(wordbookMigrationSql).toContain('missing_item_count');
    expect(wordbookMigrationSql).toMatch(/raise exception/iu);
    expect(wordbookMigrationSql).not.toMatch(
      /drop\s+table\s+(?:if\s+exists\s+)?"saved_vocabularies"/iu,
    );
  });

  it('기능별 migration마다 연속 snapshot과 journal entry를 둔다', () => {
    const metadataDirectory = new URL('../../drizzle/meta/', import.meta.url);
    const journal = JSON.parse(
      readFileSync(new URL('_journal.json', metadataDirectory), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const snapshots = [7, 8, 9].map((index) =>
      readSnapshot(metadataDirectory, index),
    );

    expect(
      journal.entries
        .filter(({ idx }) => idx >= 7 && idx <= 9)
        .map(({ idx, tag }) => ({ idx, tag })),
    ).toEqual([
      { idx: 7, tag: '0007_wave1-identity-challenge' },
      { idx: 8, tag: '0008_wave1-thai-interactions' },
      { idx: 9, tag: '0009_wave1-wordbooks' },
    ]);
    expect(snapshots[1]?.prevId).toBe(snapshots[0]?.id);
    expect(snapshots[2]?.prevId).toBe(snapshots[1]?.id);
    expect(
      snapshots[0]?.tables['public.auth_challenges']?.columns.delivery_status,
    ).toBeDefined();
    expect(
      snapshots[0]?.tables['public.expression_occurrences']?.columns.meaning_id,
    ).toBeUndefined();
    expect(snapshots[0]?.tables['public.wordbooks']).toBeUndefined();
    expect(
      snapshots[1]?.tables['public.expression_occurrences']?.columns.meaning_id,
    ).toBeDefined();
    expect(snapshots[1]?.tables['public.wordbooks']).toBeUndefined();
    expect(snapshots[2]?.tables['public.wordbooks']).toBeDefined();
  });

  it('endpoint 전환 전에 동시 쓰기를 차단하고 catch-up을 원자적으로 실행한다', () => {
    expect(existsSync(releaseGatePath)).toBe(true);
    expect(existsSync(cutoverSqlPath)).toBe(true);
    if (!existsSync(releaseGatePath)) return;

    const releaseGate = readFileSync(releaseGatePath, 'utf8');
    const cutoverSql = existsSync(cutoverSqlPath)
      ? readFileSync(cutoverSqlPath, 'utf8')
      : '';
    expect(releaseGate).toContain(
      'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/drizzle/operations/wave1-saved-vocabulary-cutover.sql',
    );
    expect(releaseGate).toContain('catch-up');
    expect(releaseGate).toContain('missing_item_count = 0');
    expect(releaseGate).toContain('endpoint cutover');
    expect(cutoverSql).toMatch(/begin;/iu);
    expect(cutoverSql).toMatch(
      /lock table "saved_vocabularies" in access exclusive mode/iu,
    );
    expect(cutoverSql).toContain('reject_legacy_saved_vocabulary_write');
    expect(cutoverSql).toMatch(/on conflict \("user_id", "name"\)/iu);
    expect(cutoverSql).toMatch(
      /on conflict \("wordbook_id", "vocabulary_id"\)/iu,
    );
    expect(cutoverSql).toContain('missing_item_count');
    expect(cutoverSql).toMatch(/commit;/iu);
  });

  it('legacy 상태에서 순차 upgrade를 검증할 fixture와 격리 DB 명령을 제공한다', () => {
    expect(existsSync(legacyFixturePath)).toBe(true);
    expect(existsSync(databaseVerificationPath)).toBe(true);
    if (
      !existsSync(legacyFixturePath) ||
      !existsSync(databaseVerificationPath)
    ) {
      return;
    }

    const fixtureSql = readFileSync(legacyFixturePath, 'utf8');
    const verification = readFileSync(databaseVerificationPath, 'utf8');
    expect(fixtureSql).toContain('insert into "saved_vocabularies"');
    expect(fixtureSql).toContain('2025-01-02 03:04:05+00');
    expect(fixtureSql).toContain('2025-02-03 04:05:06+00');
    expect(verification).toContain('000{0..6}_*.sql');
    expect(verification).toContain('wave1-legacy-saved-vocabulary.sql');
    expect(verification).toContain('0009_wave1-wordbooks.sql');
    expect(verification).toContain('db:migrate:local');
  });
});

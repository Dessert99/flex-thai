/** 삭제 마이그레이션이 공용 학습 데이터와 외래 키 경계를 보존하는지 검증한다. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const migration = readFileSync(
  new URL('../../drizzle/0025_remove_question_learning.sql', import.meta.url),
  'utf8',
);
const previous = JSON.parse(
  readFileSync(
    new URL('../../drizzle/meta/0024_snapshot.json', import.meta.url),
    'utf8',
  ),
) as Snapshot;
const current = JSON.parse(
  readFileSync(
    new URL('../../drizzle/meta/0025_snapshot.json', import.meta.url),
    'utf8',
  ),
) as Snapshot;
interface Snapshot {
  tables: Record<
    string,
    { name: string; foreignKeys: Record<string, { tableTo: string }> }
  >;
}
describe('문제·연습 제거 경계', () => {
  it('삭제 대상 15개를 명시하며 공용 어휘·단어장·개념은 보존한다', () => {
    const removed = Object.keys(previous.tables).filter(
      (key) => !(key in current.tables),
    );
    expect(removed).toHaveLength(15);
    for (const key of removed)
      expect(migration).toContain(`"${previous.tables[key]!.name}"`);
    for (const table of [
      'vocabularies',
      'vocabulary_meanings',
      'wordbooks',
      'wordbook_items',
      'concepts',
      'vocabulary_production_candidates',
    ])
      expect(current.tables[`public.${table}`]).toBeDefined();
    expect(migration).not.toMatch(/\bCASCADE\b/i);
    expect(migration).not.toMatch(
      /DROP TABLE\s+"?(?:vocabularies|wordbooks|concepts)\b/i,
    );
  });
  it('남아 있는 외래 키가 삭제한 테이블을 가리키지 않는다', () => {
    const tables = new Set(
      Object.values(current.tables).map((table) => table.name),
    );
    for (const table of Object.values(current.tables))
      for (const fk of Object.values(table.foreignKeys))
        expect(tables.has(fk.tableTo)).toBe(true);
  });
  it('기존 enum 값을 먼저 정리하고 어휘를 포함한 혼합 제작은 보존한다', () => {
    expect(migration.indexOf('DELETE FROM content_error_reports')).toBeLessThan(
      migration.indexOf(
        'DROP TYPE "public"."content_error_report_target_kind"',
      ),
    );
    expect(migration.indexOf('DELETE FROM job_items')).toBeLessThan(
      migration.indexOf('DROP TYPE "public"."content_production_operation"'),
    );
    expect(migration).toContain(
      "WHERE purpose = 'VOCABULARY_THEN_QUESTION_GENERATION'",
    );
    expect(migration).not.toMatch(
      /DELETE FROM (?:vocabularies|vocabulary_meanings|wordbooks|wordbook_items|vocabulary_production_candidates)\b/,
    );
  });
});

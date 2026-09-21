/** 삭제 마이그레이션의 대상과 단어 추출·공용 데이터 보존 경계를 검증한다. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
type Snapshot = {
  tables: Record<
    string,
    { name: string; foreignKeys: Record<string, { tableTo: string }> }
  >;
};
const read = (file: string) =>
  readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');
const before = JSON.parse(read('meta/0025_snapshot.json')) as Snapshot;
const after = JSON.parse(read('meta/0026_snapshot.json')) as Snapshot;
const sql = read('0026_remove_content_and_concepts.sql');
describe('콘텐츠 제작·가져오기·개념 제거', () => {
  it('13개 테이블만 삭제하고 공용 어휘·단어장·추출·업로드를 보존한다', () => {
    const removed = Object.keys(before.tables).filter(
      (key) => !after.tables[key],
    );
    expect(removed).toHaveLength(13);
    for (const key of removed)
      expect(sql).toContain(`"${before.tables[key]!.name}"`);
    for (const name of [
      'vocabularies',
      'vocabulary_meanings',
      'wordbooks',
      'wordbook_items',
      'vocabulary_extraction_jobs',
      'vocabulary_extraction_chunks',
      'extraction_templates',
      'uploads',
      'provider_runs',
    ])
      expect(after.tables[`public.${name}`]).toBeDefined();
    expect(sql).not.toMatch(/\bCASCADE\b/i);
  });
  it('잔존 외래 키가 모두 존재하는 테이블을 참조한다', () => {
    const tables = new Set(
      Object.values(after.tables).map((table) => table.name),
    );
    for (const table of Object.values(after.tables))
      for (const fk of Object.values(table.foreignKeys))
        expect(tables.has(fk.tableTo)).toBe(true);
    expect(sql.indexOf('DROP CONSTRAINT')).toBeLessThan(
      sql.indexOf('DROP TABLE'),
    );
    expect(sql.indexOf('DELETE FROM content_error_reports')).toBeLessThan(
      sql.indexOf('DROP TYPE'),
    );
  });
});

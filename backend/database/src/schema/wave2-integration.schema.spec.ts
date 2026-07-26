/** Wave 2 migration의 기능 분리와 snapshot 연속성을 검증한다 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationDirectory = new URL('../../drizzle/', import.meta.url);
const metadataDirectory = new URL('../../drizzle/meta/', import.meta.url);
const migrations = [
  { index: 10, prefix: '0010_', table: 'vocabulary_practice_sessions' },
  { index: 11, prefix: '0011_', table: 'concepts' },
  { index: 12, prefix: '0012_', table: 'content_error_reports' },
] as const;

const readSnapshot = (index: number) =>
  JSON.parse(
    readFileSync(
      new URL(
        `${String(index).padStart(4, '0')}_snapshot.json`,
        metadataDirectory,
      ),
      'utf8',
    ),
  ) as { id: string; prevId: string };

describe('Wave 2 병합 migration', () => {
  it('연습·개념·신고 table을 서로 다른 순차 migration으로 추가한다', () => {
    const journal = JSON.parse(
      readFileSync(new URL('_journal.json', metadataDirectory), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entries = journal.entries.filter(({ idx }) => idx >= 10 && idx <= 12);

    expect(entries.map(({ idx }) => idx)).toEqual([10, 11, 12]);
    migrations.forEach(({ index, prefix, table }) => {
      const tag = entries.find(({ idx }) => idx === index)?.tag;
      expect(tag?.startsWith(prefix)).toBe(true);
      expect(
        readFileSync(new URL(`${tag}.sql`, migrationDirectory), 'utf8'),
      ).toContain(`CREATE TABLE "${table}"`);
    });
  });

  it('세 migration snapshot이 이전 schema에서 끊김 없이 이어진다', () => {
    const snapshots = migrations.map(({ index }) => readSnapshot(index));

    expect(snapshots[1]?.prevId).toBe(snapshots[0]?.id);
    expect(snapshots[2]?.prevId).toBe(snapshots[1]?.id);
  });
});

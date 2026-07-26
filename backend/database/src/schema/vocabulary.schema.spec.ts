/** 공용 어휘 schema가 실제 게시 시각을 보존하는지 검증한다 */
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { vocabularies } from './vocabulary.schema.js';

describe('공용 어휘 데이터베이스 schema', () => {
  it('추천 정렬에 사용할 nullable 게시 시각을 저장한다', () => {
    const columns = getTableColumns(vocabularies);

    expect(columns.publishedAt.name).toBe('published_at');
    expect(columns.publishedAt.notNull).toBe(false);
  });
});

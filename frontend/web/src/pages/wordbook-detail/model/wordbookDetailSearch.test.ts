/** 단어장 상세 URL 검색값의 기본값·trim·strict 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import { parseWordbookDetailSearch } from './wordbookDetailSearch';

describe('단어장 상세 검색값', () => {
  it('기본 page를 채우고 검색어·필터를 정규화한다', () => {
    expect(
      parseWordbookDetailSearch({
        query: ' สวัสดี ',
        kind: 'WORD',
        partOfSpeech: ' 감탄사 ',
        difficulty: '2',
      }),
    ).toEqual({
      query: 'สวัสดี',
      kind: 'WORD',
      partOfSpeech: '감탄사',
      difficulty: 2,
      page: 1,
      pageSize: 20,
    });
  });

  it('알 수 없는 key와 잘못된 page를 거부한다', () => {
    expect(() => parseWordbookDetailSearch({ page: '0' })).toThrow();
    expect(() =>
      parseWordbookDetailSearch({ page: '1', extra: true }),
    ).toThrow();
  });
});

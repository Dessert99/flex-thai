/** 어휘 목록 URL filter와 page 전환 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  changeVocabularyListFilters,
  changeVocabularyListPage,
  parseVocabularyListSearch,
} from './vocabularyListSearch';

describe('어휘 목록 검색 상태', () => {
  it('태국어·한국어 검색어와 계약 필터·페이지를 보존한다', () => {
    expect(
      parseVocabularyListSearch({
        query: 'โรงเรียน 학교',
        kind: 'WORD',
        partOfSpeech: '명사',
        difficulty: '3',
        page: '2',
        pageSize: '20',
      }),
    ).toEqual({
      query: 'โรงเรียน 학교',
      kind: 'WORD',
      partOfSpeech: '명사',
      difficulty: 3,
      page: 2,
      pageSize: 20,
    });
  });

  it('filter 변경은 page를 1로 reset하고 page 이동은 기존 filter를 보존한다', () => {
    const current = parseVocabularyListSearch({
      query: 'โรงเรียน',
      kind: 'WORD',
      partOfSpeech: '명사',
      difficulty: 3,
      page: 2,
      pageSize: 20,
    });

    expect(
      changeVocabularyListFilters(current, { kind: 'EXPRESSION' }),
    ).toEqual({
      ...current,
      kind: 'EXPRESSION',
      page: 1,
    });
    expect(changeVocabularyListPage(current, 3)).toEqual({
      ...current,
      page: 3,
    });
  });
});

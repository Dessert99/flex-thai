/** 어휘 목록 URL 검색값을 공개 계약과 동일하게 검증한다 */
import {
  vocabularyListQuerySchema,
  type VocabularyListQuery,
} from '@flex-thia/contracts';

/** Router와 Page가 공유하는 검증된 어휘 검색값 */
export type VocabularyListSearch = VocabularyListQuery;

/** 페이지를 제외한 어휘 목록 filter 변경값 */
export type VocabularyListFilterPatch = Partial<
  Pick<VocabularyListSearch, 'difficulty' | 'kind' | 'partOfSpeech' | 'query'>
>;

const parseCompactSearch = (
  search: Record<string, unknown>,
): VocabularyListSearch =>
  vocabularyListQuerySchema.parse(
    Object.fromEntries(
      Object.entries(search).filter(([, value]) => value !== undefined),
    ),
  );

/** 검색어의 Thai/Korean 원문과 계약 기본 페이지를 보존한다 */
export function parseVocabularyListSearch(
  search: Record<string, unknown>,
): VocabularyListSearch {
  return parseCompactSearch(search);
}

/** filter 변경 시 첫 page로 돌아가고 undefined filter를 URL에서 제거한다 */
export function changeVocabularyListFilters(
  search: VocabularyListSearch,
  patch: VocabularyListFilterPatch,
): VocabularyListSearch {
  return parseCompactSearch({ ...search, ...patch, page: 1 });
}

/** page만 바꾸며 현재 어휘 filter를 모두 보존한다 */
export function changeVocabularyListPage(
  search: VocabularyListSearch,
  page: number,
): VocabularyListSearch {
  return parseCompactSearch({ ...search, page });
}

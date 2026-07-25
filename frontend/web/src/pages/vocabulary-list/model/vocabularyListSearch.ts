/** 어휘 목록 URL 검색값을 공개 계약과 동일하게 검증한다 */
import {
  vocabularyListQuerySchema,
  type VocabularyListQuery,
} from '@flex-thia/contracts';

/** Router와 Page가 공유하는 검증된 어휘 검색값 */
export type VocabularyListSearch = VocabularyListQuery;

/** 검색어의 Thai/Korean 원문과 계약 기본 페이지를 보존한다 */
export function parseVocabularyListSearch(
  search: Record<string, unknown>,
): VocabularyListSearch {
  return vocabularyListQuerySchema.parse(search);
}

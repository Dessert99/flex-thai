/** 단어장 상세 URL 검색값을 공개 계약으로 정규화한다 */
import {
  wordbookItemListQuerySchema,
  type WordbookItemListQuery,
} from '@flex-thia/contracts';

/** strict URL 검색값을 단어장 상세 검색 상태로 변환한다 */
export function parseWordbookDetailSearch(
  search: Record<string, unknown>,
): WordbookDetailSearch {
  return wordbookItemListQuerySchema.parse(search);
}

/** 단어장 상세 화면이 소유하는 검증된 URL 검색 상태 */
export type WordbookDetailSearch = WordbookItemListQuery;

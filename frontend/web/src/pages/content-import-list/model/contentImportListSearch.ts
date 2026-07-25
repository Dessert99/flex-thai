/** 관리자 콘텐츠 가져오기 이력의 URL 검색값을 공개 계약으로 검증한다 */
import {
  contentImportListQuerySchema,
  type ContentImportListQuery,
} from '@flex-thia/contracts';

/** Router와 목록 Page가 공유하는 검증된 페이지 검색값 */
export type ContentImportListSearch = ContentImportListQuery;

/** 계약 기본값을 적용해 가져오기 이력 검색값을 만든다 */
export function parseContentImportListSearch(
  search: Record<string, unknown>,
): ContentImportListSearch {
  return contentImportListQuerySchema.parse(search);
}

/** 관리자 어휘 목록 URL 검색값을 공개 계약으로 검증한다 */
import {
  adminVocabularyListQuerySchema,
  type AdminVocabularyListQuery,
} from '@flex-thia/contracts';

/** Router와 관리 Page가 공유하는 어휘 검색값 */
export type AdminVocabularySearch = AdminVocabularyListQuery;

/** 계약 기본 페이지를 채우고 지원하지 않는 검색값을 거부한다 */
export function parseAdminVocabularySearch(
  search: Record<string, unknown>,
): AdminVocabularySearch {
  return adminVocabularyListQuerySchema.parse(search);
}

/** 어휘 필터 변경 시 첫 페이지로 돌아간다 */
export function changeAdminVocabularySearch(
  search: AdminVocabularySearch,
  patch: Partial<AdminVocabularySearch>,
) {
  return parseAdminVocabularySearch(
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: 1 }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  );
}

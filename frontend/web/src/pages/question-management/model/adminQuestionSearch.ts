/** 관리자 문제 목록 URL 검색값을 공개 계약과 같은 범위로 검증한다 */
import {
  adminQuestionListQuerySchema,
  type AdminQuestionListQuery,
} from '@flex-thia/contracts';

/** Router와 관리 Page가 공유하는 검증된 문제 검색값 */
export type AdminQuestionSearch = AdminQuestionListQuery;

/** 알 수 없는 키와 계약 범위 밖 값을 거부하고 페이지 기본값을 채운다 */
export function parseAdminQuestionSearch(
  search: Record<string, unknown>,
): AdminQuestionSearch {
  return adminQuestionListQuerySchema.parse(search);
}

/** 필터 변경을 반영하면서 첫 페이지로 돌아가고 빈 키를 제거한다 */
export function changeAdminQuestionFilters(
  search: AdminQuestionSearch,
  patch: Partial<AdminQuestionSearch>,
): AdminQuestionSearch {
  return parseAdminQuestionSearch(
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: 1 }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  );
}

/** 페이지 외 관리자 문제 필터가 하나라도 적용됐는지 확인한다 */
export function hasAdminQuestionFilters(search: AdminQuestionSearch) {
  return [
    search.status,
    search.versionStatus,
    search.validationStatus,
    search.questionTypeSlug,
    search.skill,
    search.difficulty,
  ].some((value) => value !== undefined);
}

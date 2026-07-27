/** 사용자 관리 URL 검색 상태를 공개 계약으로 정규화한다 */
import {
  userManagementListQuerySchema,
  type UserManagementListQuery,
} from '@flex-thia/contracts';

/** 사용자 관리 URL 검색 상태 */
export type UserManagementSearch = UserManagementListQuery;

/** Router raw search에 기본 페이지와 strict 필터 검증을 적용한다 */
export function parseUserManagementSearch(
  raw: Record<string, unknown>,
): UserManagementSearch {
  return userManagementListQuerySchema.parse(raw);
}

/** 사용자 검색 상태를 API query string으로 직렬화한다 */
export function serializeUserManagementSearch(
  search: UserManagementSearch,
): string {
  const params = new URLSearchParams();
  if (search.query) params.set('query', search.query);
  if (search.role) params.set('role', search.role);
  if (search.status) params.set('status', search.status);
  if (search.mfaEnrolled !== undefined) {
    params.set('mfaEnrolled', String(search.mfaEnrolled));
  }
  params.set('page', String(search.page));
  params.set('pageSize', String(search.pageSize));
  return `?${params.toString()}`;
}

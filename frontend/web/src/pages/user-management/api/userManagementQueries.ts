/** 사용자 관리 화면의 조회·역할·상태 API 요청을 정의한다 */
import {
  managedIdentityUserResponseSchema,
  userManagementListResponseSchema,
  type ManagedIdentityUserRole,
  type ManagedIdentityUserStatus,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import {
  serializeUserManagementSearch,
  type UserManagementSearch,
} from '../model/userManagementSearch';

/** 사용자 목록 cache key prefix */
export const userManagementQueryKey = ['admin', 'users'] as const;

/** URL 검색 상태에 대응하는 사용자 목록 query options */
export function userManagementQueryOptions(search: UserManagementSearch) {
  return queryOptions({
    queryKey: [...userManagementQueryKey, search],
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/users${serializeUserManagementSearch(search)}`,
        response: { kind: 'json', schema: userManagementListResponseSchema },
        signal,
      }),
  });
}

/** 사용자 상태를 변경한다 */
export function changeUserStatus(
  userId: string,
  status: ManagedIdentityUserStatus,
) {
  return authenticatedRequest({
    body: { status },
    method: 'PATCH',
    path: `/admin/users/${userId}/status`,
    response: { kind: 'json', schema: managedIdentityUserResponseSchema },
  });
}

/** 사용자 역할을 변경한다 */
export function changeUserRole(userId: string, role: ManagedIdentityUserRole) {
  return authenticatedRequest({
    body: { role },
    method: 'PATCH',
    path: `/admin/users/${userId}/role`,
    response: { kind: 'json', schema: managedIdentityUserResponseSchema },
  });
}

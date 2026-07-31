/** 사용량·비용 overview와 경고 설정의 인증 query를 정의한다 */
import {
  operationsCostSettingsResponseSchema,
  updateOperationsCostSettingsRequestSchema,
  usageCostOverviewResponseSchema,
  type UpdateOperationsCostSettingsRequest,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import {
  serializeUsageCostSearch,
  type UsageCostSearch,
} from '../model/usageCostSearch';

/** 사용량·비용 overview cache key prefix */
export const usageCostQueryKey = ['admin', 'usage-cost'] as const;

/** 비용 경고 설정 cache key */
export const usageCostSettingsQueryKey = [
  'admin',
  'usage-cost',
  'settings',
] as const;

/** URL filter에 대응하는 overview query options */
export function usageCostOverviewQueryOptions(search: UsageCostSearch) {
  return queryOptions({
    queryKey: [...usageCostQueryKey, 'overview', search],
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/usage-cost${serializeUsageCostSearch(search)}`,
        response: { kind: 'json', schema: usageCostOverviewResponseSchema },
        signal,
      }),
  });
}

/** 비용 경고 settings query options */
export function usageCostSettingsQueryOptions() {
  return queryOptions({
    queryKey: usageCostSettingsQueryKey,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: '/admin/usage-cost/settings',
        response: {
          kind: 'json',
          schema: operationsCostSettingsResponseSchema,
        },
        signal,
      }),
  });
}

/** optimistic 비용 경고 settings 변경 요청 */
export function updateOperationsCostSettings(
  input: UpdateOperationsCostSettingsRequest,
) {
  return authenticatedRequest({
    method: 'PUT',
    path: '/admin/usage-cost/settings',
    body: updateOperationsCostSettingsRequestSchema.parse(input),
    response: { kind: 'json', schema: operationsCostSettingsResponseSchema },
  });
}

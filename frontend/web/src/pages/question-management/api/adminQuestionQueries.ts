/** 관리자 문제 목록의 계약 직렬화와 계층형 Query key를 정의한다 */
import { adminQuestionListResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import type { AdminQuestionSearch } from '../model/adminQuestionSearch';

const filterOrder = [
  'status',
  'versionStatus',
  'validationStatus',
  'questionTypeSlug',
  'skill',
  'difficulty',
  'page',
  'pageSize',
] as const;

/** URL 검색값과 취소 signal을 관리자 목록 요청에 그대로 연결한다 */
export function adminQuestionListQueryOptions(search: AdminQuestionSearch) {
  return queryOptions({
    queryKey: ['admin', 'questions', 'list', search] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/questions?${serializeAdminQuestionSearch(search)}`,
        response: { kind: 'json', schema: adminQuestionListResponseSchema },
        signal,
      }),
  });
}

function serializeAdminQuestionSearch(search: AdminQuestionSearch) {
  const query = new URLSearchParams();
  filterOrder.forEach((key) => {
    const value = search[key];
    if (value !== undefined) {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

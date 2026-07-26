/** 감사 기록 URL 검색·선택 상태를 공개 계약으로 정규화한다 */
import {
  auditLogListQuerySchema,
  type AuditLogListQuery,
} from '@flex-thia/contracts';
import { z } from 'zod';

/** 목록 필터와 선택한 상세 UUID를 함께 소유하는 URL 상태 */
export type AuditLogSearch = AuditLogListQuery & { selectedAuditId?: string };

/** Router raw search에서 상세 UUID를 분리하고 목록 계약을 검증한다 */
export function parseAuditLogSearch(
  raw: Record<string, unknown>,
): AuditLogSearch {
  const { selectedAuditId, ...listRaw } = raw;
  return {
    ...auditLogListQuerySchema.parse(listRaw),
    ...(selectedAuditId !== undefined
      ? { selectedAuditId: z.uuid().parse(selectedAuditId) }
      : {}),
  };
}

/** 상세 선택을 제외한 감사 목록 조건을 API query로 직렬화한다 */
export function serializeAuditLogSearch(search: AuditLogSearch): string {
  const params = new URLSearchParams();
  for (const key of [
    'query',
    'actorUserId',
    'action',
    'targetType',
    'targetId',
    'from',
    'to',
  ] as const) {
    if (search[key]) params.set(key, String(search[key]));
  }
  params.set('page', String(search.page));
  params.set('pageSize', String(search.pageSize));
  return `?${params.toString()}`;
}

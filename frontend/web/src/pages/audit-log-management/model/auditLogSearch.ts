/** 감사 기록 URL 검색·선택 상태를 공개 계약으로 정규화한다 */
import {
  auditLogListQuerySchema,
  type AuditLogListQuery,
} from '@flex-thia/contracts';
import { z } from 'zod';

/** 목록 필터와 선택한 상세 UUID를 함께 소유하는 URL 상태 */
export type AuditLogSearch = AuditLogListQuery & { selectedAuditId?: string };

const padDatePart = (value: number) => String(value).padStart(2, '0');

/** UTC ISO URL 값을 현재 브라우저 지역의 datetime-local 값으로 바꾼다 */
export function toAuditDatetimeLocal(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return [
    date.getFullYear(),
    '-',
    padDatePart(date.getMonth() + 1),
    '-',
    padDatePart(date.getDate()),
    'T',
    padDatePart(date.getHours()),
    ':',
    padDatePart(date.getMinutes()),
    ':',
    padDatePart(date.getSeconds()),
  ].join('');
}

/** datetime-local 값을 같은 절대 시각의 UTC ISO URL 값으로 바꾼다 */
export function fromAuditDatetimeLocal(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

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

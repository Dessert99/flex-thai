/** 사용량·비용 filter를 strict router search와 API query string으로 정규화한다 */
import {
  usageCostOverviewQuerySchema,
  type UsageCostOverviewQuery,
} from '@flex-thia/contracts';

/** 사용량·비용 페이지가 URL에 보존하는 filter 상태 */
export type UsageCostSearch = UsageCostOverviewQuery;

/** Router raw search를 공개 계약으로 검증한다 */
export function parseUsageCostSearch(
  raw: Record<string, unknown>,
): UsageCostSearch {
  return usageCostOverviewQuerySchema.parse(raw);
}

/** 정의된 filter 순서로만 overview query string을 만든다 */
export function serializeUsageCostSearch(search: UsageCostSearch): string {
  const parameters = new URLSearchParams();
  for (const key of [
    'from',
    'to',
    'source',
    'provider',
    'model',
    'voice',
    'status',
  ] as const) {
    if (search[key] !== undefined) parameters.set(key, search[key]);
  }
  const value = parameters.toString();
  return value ? `?${value}` : '';
}

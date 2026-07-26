/** 관리자 개념 목록 URL search를 strict 계약으로 관리한다 */
import {
  adminConceptListQuerySchema,
  type AdminConceptListQuery,
} from '@flex-thia/contracts';

export type AdminConceptSearch = AdminConceptListQuery;

/** Router raw search를 관리자 개념 query로 정규화한다 */
export function parseAdminConceptSearch(
  raw: Record<string, unknown>,
): AdminConceptSearch {
  return adminConceptListQuerySchema.parse(raw);
}

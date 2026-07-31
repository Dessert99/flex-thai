/** 어휘 후보 URL filter를 공유 strict query 기본값으로 정규화한다 */
import {
  vocabularyCandidateListQuerySchema,
  type VocabularyCandidateListQuery,
} from '@flex-thia/contracts';

/** 어휘 후보 관리 화면 검색 상태 */
export type VocabularyCandidateSearch = VocabularyCandidateListQuery;

/** raw Router search에 UUID·enum·page 기본값을 적용한다 */
export const parseVocabularyCandidateSearch = (
  raw: Record<string, unknown>,
): VocabularyCandidateSearch => vocabularyCandidateListQuerySchema.parse(raw);

/** filter 변경 시 기존 URL filter를 보존하고 목록을 첫 page로 되돌린다 */
export const changeVocabularyCandidateFilters = (
  search: VocabularyCandidateSearch,
  patch: Pick<Partial<VocabularyCandidateSearch>, 'jobId' | 'reviewStatus'>,
): VocabularyCandidateSearch => {
  const next = { ...search, ...patch };
  return {
    ...(next.jobId ? { jobId: next.jobId } : {}),
    ...(next.reviewStatus ? { reviewStatus: next.reviewStatus } : {}),
    page: 1,
    pageSize: next.pageSize,
  };
};

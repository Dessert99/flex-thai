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

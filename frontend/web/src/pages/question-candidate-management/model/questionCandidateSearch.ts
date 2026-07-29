/** 문제 후보 URL filter를 공유 strict query 기본값으로 정규화한다 */
import {
  questionCandidateListQuerySchema,
  type QuestionCandidateListQuery,
} from '@flex-thia/contracts';

/** 문제 후보 관리 화면 검색 상태 */
export type QuestionCandidateSearch = QuestionCandidateListQuery;

/** raw Router search에 UUID·enum·page 기본값을 적용한다 */
export const parseQuestionCandidateSearch = (
  raw: Record<string, unknown>,
): QuestionCandidateSearch => questionCandidateListQuerySchema.parse(raw);

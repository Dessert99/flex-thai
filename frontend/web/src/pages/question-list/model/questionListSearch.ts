/** 문제 목록 URL 검색값을 공개 API 계약과 동일한 범위로 검증한다 */
import {
  questionListQuerySchema,
  type QuestionListQuery,
} from '@flex-thia/contracts';

/** Router와 Page가 공유하는 검증된 문제 목록 검색값 */
export type QuestionListSearch = QuestionListQuery;

/** 알 수 없는 키와 계약 범위 밖 값을 거부하고 기본 페이지를 채운다 */
export function parseQuestionListSearch(
  search: Record<string, unknown>,
): QuestionListSearch {
  return questionListQuerySchema.parse(search);
}

/** 선택 필터를 반영하면서 페이지를 1로 되돌리고 undefined 키를 제거한다 */
export function changeQuestionListFilters(
  search: QuestionListSearch,
  patch: Partial<QuestionListSearch>,
): QuestionListSearch {
  return parseQuestionListSearch(
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: 1 }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  );
}

/** 페이지 키를 제외한 API 필터가 하나라도 적용됐는지 확인한다 */
export function hasQuestionListFilters(search: QuestionListSearch): boolean {
  return [
    search.skill,
    search.questionTypeId,
    search.difficulty,
    search.saved,
    search.firstResult,
  ].some((value) => value !== undefined);
}

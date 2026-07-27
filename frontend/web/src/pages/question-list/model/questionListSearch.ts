/** 문제 목록 URL 검색값을 공개 API 계약과 동일한 범위로 검증한다 */
import {
  questionListQuerySchema,
  type QuestionListQuery,
} from '@flex-thia/contracts';

/** Router와 Page가 기본값 없이 공유하는 문제 목록 URL 검색값 */
export type QuestionListSearch = {
  skill?: QuestionListQuery['skill'];
  majorCategory?: QuestionListQuery['majorCategory'];
  questionTypeId?: QuestionListQuery['questionTypeId'];
  topicId?: QuestionListQuery['topicId'];
  tagId?: QuestionListQuery['tagId'];
  difficulty?: QuestionListQuery['difficulty'];
  saved?: QuestionListQuery['saved'];
  firstResult?: QuestionListQuery['firstResult'];
  sort?: QuestionListQuery['sort'];
  page?: QuestionListQuery['page'];
  pageSize?: QuestionListQuery['pageSize'] | undefined;
};

const normalizeEmptyStrings = (search: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(search).map(([key, value]) => [
      key,
      value === '' ? undefined : value,
    ]),
  );

/** 알 수 없는 키와 계약 범위 밖 값을 거부하고 기본 페이지를 채운다 */
export function parseQuestionListSearch(
  search: Record<string, unknown>,
): QuestionListSearch {
  return questionListQuerySchema.parse(normalizeEmptyStrings(search));
}

/** 필터 변경은 페이지를 생략하고 페이지 이동은 기존 필터를 보존한다 */
export function applyQuestionFilterPatch(
  search: QuestionListSearch,
  patch: Partial<QuestionListSearch>,
): QuestionListSearch {
  const nextSearch = normalizeEmptyStrings({ ...search, ...patch });
  const pageOnlyPatch = Object.keys(patch).every((key) => key === 'page');

  return {
    ...nextSearch,
    page: pageOnlyPatch ? nextSearch.page : undefined,
  } as QuestionListSearch;
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
    search.majorCategory,
    search.questionTypeId,
    search.topicId,
    search.tagId,
    search.difficulty,
    search.saved,
    search.firstResult,
  ].some((value) => value !== undefined);
}

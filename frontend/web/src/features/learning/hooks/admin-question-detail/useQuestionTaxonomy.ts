import { useQuery } from '@tanstack/react-query';
import { questionTaxonomySettingsQueryOptions } from '../../apis/question-taxonomy-settings/questionTaxonomyQueries';
/** 편집 화면에서 사용하는 taxonomy 조회 */
export const useQuestionTaxonomy = () =>
  useQuery(questionTaxonomySettingsQueryOptions());

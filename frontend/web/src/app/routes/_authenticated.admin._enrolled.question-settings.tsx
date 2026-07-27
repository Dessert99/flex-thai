/** 관리자 문제 유형 설정 Page를 등록한다 */
import { createFileRoute } from '@tanstack/react-router';
import { QuestionTaxonomySettingsPageContainer } from '@/pages/question-taxonomy-settings';

/** 등록된 관리자 guard 아래에서 문제 유형 설정을 렌더링한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/question-settings',
)({
  component: QuestionTaxonomySettingsPageContainer,
});

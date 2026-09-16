/** 기능 화면을 조립하는 페이지 진입점 */
import { QuestionTaxonomySettingsPageContainer } from '@/features/learning/components/question-taxonomy-settings/QuestionTaxonomySettingsPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function QuestionTaxonomySettingsPage() {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <QuestionTaxonomySettingsPageContainer />
    </div>
  );
}

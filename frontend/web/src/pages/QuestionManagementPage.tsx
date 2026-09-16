/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { QuestionManagementPageContainer } from '@/features/learning/components/question-management/QuestionManagementPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function QuestionManagementPage(
  props: ComponentProps<typeof QuestionManagementPageContainer>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <QuestionManagementPageContainer {...props} />
    </div>
  );
}

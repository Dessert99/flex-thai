/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { QuestionSolvingPageContainer } from '@/features/learning/components/question-solving/QuestionSolvingPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function QuestionSolvingPage(
  props: ComponentProps<typeof QuestionSolvingPageContainer>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <QuestionSolvingPageContainer {...props} />
    </div>
  );
}

/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { VocabularyPracticeResultPageContainer } from '@/features/learning/components/vocabulary-practice-result/VocabularyPracticeResultPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function VocabularyPracticeResultPage(
  props: ComponentProps<typeof VocabularyPracticeResultPageContainer>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <VocabularyPracticeResultPageContainer {...props} />
    </div>
  );
}

/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { VocabularyManagementPageContainer } from '@/features/learning/components/vocabulary-management/VocabularyManagementPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function VocabularyManagementPage(
  props: ComponentProps<typeof VocabularyManagementPageContainer>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <VocabularyManagementPageContainer {...props} />
    </div>
  );
}

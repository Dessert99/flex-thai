/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { AdminVocabularyDetailPageContainer } from '@/features/learning/components/admin-vocabulary-detail/AdminVocabularyDetailPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function AdminVocabularyDetailPage(
  props: ComponentProps<typeof AdminVocabularyDetailPageContainer>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <AdminVocabularyDetailPageContainer {...props} />
    </div>
  );
}

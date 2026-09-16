/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { ConceptManagementPageContainer } from '@/features/learning/components/concept-management/ConceptManagementPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function ConceptManagementPage(
  props: ComponentProps<typeof ConceptManagementPageContainer>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <ConceptManagementPageContainer {...props} />
    </div>
  );
}

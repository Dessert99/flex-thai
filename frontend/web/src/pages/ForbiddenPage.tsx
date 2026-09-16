/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { ForbiddenPage as ForbiddenPageContent } from '@/features/navigation/components/forbidden/ForbiddenPage';

/** 라우트 입력을 기능 화면에 전달한다 */
export function ForbiddenPage(
  props: ComponentProps<typeof ForbiddenPageContent>,
) {
  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <ForbiddenPageContent {...props} />
    </main>
  );
}

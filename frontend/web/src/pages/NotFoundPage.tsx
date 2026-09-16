/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { NotFoundPage as NotFoundPageContent } from '@/features/navigation/components/not-found/NotFoundPage';

/** 라우트 입력을 기능 화면에 전달한다 */
export function NotFoundPage(
  props: ComponentProps<typeof NotFoundPageContent>,
) {
  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <NotFoundPageContent {...props} />
    </main>
  );
}

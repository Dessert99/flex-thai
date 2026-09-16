/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { LoginPageContainer } from '@/features/identity/components/login/LoginPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function LoginPage(props: ComponentProps<typeof LoginPageContainer>) {
  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <LoginPageContainer {...props} />
    </main>
  );
}

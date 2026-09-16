/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { LoginTotpPageContainer } from '@/features/identity/components/login-totp/LoginTotpPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function LoginTotpPage(
  props: ComponentProps<typeof LoginTotpPageContainer>,
) {
  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <LoginTotpPageContainer {...props} />
    </main>
  );
}

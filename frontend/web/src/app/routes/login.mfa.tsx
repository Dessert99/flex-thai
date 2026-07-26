/** 메모리 challenge가 있는 경우에만 로그인 TOTP Page를 노출한다 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoginTotpPageContainer } from '@/pages/login-totp';
import { hasLoginTotpChallenge } from '@/shared/api';

/** 직접 reload로 challenge가 사라진 경우 로그인 index로 되돌린다 */
export const Route = createFileRoute('/login/mfa')({
  beforeLoad: () => {
    requireLoginTotpChallenge(hasLoginTotpChallenge());
  },
  component: LoginTotpRoute,
});

function LoginTotpRoute() {
  const { redirect: redirectTo } = Route.useSearch();
  return (
    <LoginTotpPageContainer
      {...(redirectTo === undefined ? {} : { redirectTo })}
    />
  );
}

/** 메모리 challenge가 사라진 직접 접근을 로그인 index로 되돌린다 */
export function requireLoginTotpChallenge(challengeAvailable: boolean): void {
  if (!challengeAvailable) {
    redirect({ throw: true, to: '/login' });
  }
}

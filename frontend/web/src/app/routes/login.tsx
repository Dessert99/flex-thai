/** 공개 로그인 shell과 안전한 redirect search를 정의한다 */
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import type { MeResponse } from '@flex-thia/contracts';
import { parseSafeRedirect } from '../routing/redirectSearch';

/** 로그인 search와 이미 인증된 사용자의 우회 navigation을 검증한다 */
export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    const state = context.authSessionStore.getSnapshot();
    if (state.status === 'authenticated') {
      redirect({
        throw: true,
        to: getUserHome(state.user),
      });
    }
  },
  component: LoginRoute,
  validateSearch: (search: Record<string, unknown>) => {
    const safeRedirect = parseSafeRedirect(search.redirect);
    return safeRedirect === undefined ? {} : { redirect: safeRedirect };
  },
});

function LoginRoute() {
  return <Outlet />;
}

function getUserHome(user: MeResponse) {
  if (user.role === 'LEARNER') {
    return '/learn' as const;
  }
  return user.mfaEnrolled
    ? ('/admin' as const)
    : ('/admin/totp-setup' as const);
}

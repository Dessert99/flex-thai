/** 메모리 이메일 challenge가 있는 경우에만 code 인증 Page를 노출한다 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import { EmailChallengePageContainer } from '@/pages/email-challenge';
import { getPendingEmailChallenge } from '@/shared/api';

/** 직접 reload로 challenge가 사라진 경우 로그인 index로 되돌린다 */
export const Route = createFileRoute('/login/challenge')({
  beforeLoad: () => {
    requirePendingEmailChallenge(getPendingEmailChallenge() !== undefined);
  },
  component: EmailChallengeRoute,
});

function EmailChallengeRoute() {
  const { redirect: redirectTo } = Route.useSearch();
  return (
    <EmailChallengePageContainer
      {...(redirectTo === undefined ? {} : { redirectTo })}
    />
  );
}

/** 메모리 challenge가 사라진 직접 접근을 로그인 index로 되돌린다 */
export function requirePendingEmailChallenge(
  challengeAvailable: boolean,
): void {
  if (!challengeAvailable) {
    redirect({ throw: true, to: '/login' });
  }
}

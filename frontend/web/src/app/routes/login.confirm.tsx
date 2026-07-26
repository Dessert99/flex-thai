/** 이메일 링크를 scanner-safe 명시적 확인 Page에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { EmailLinkConfirmPageContainer } from '@/pages/email-link-confirm';
import { parseSafeRedirect } from '../routing/redirectSearch';

/** 이메일 링크 확인 route가 허용하는 검색값 */
export interface EmailConfirmSearch {
  challengeId?: string;
  redirect?: string;
  token?: string;
}

/** 링크 입력과 승인된 redirect만 Page에 전달한다 */
export const Route = createFileRoute('/login/confirm')({
  component: EmailLinkConfirmRoute,
  validateSearch: (search: Record<string, unknown>): EmailConfirmSearch => {
    const redirect = parseSafeRedirect(search.redirect);
    return {
      ...(typeof search.challengeId === 'string'
        ? { challengeId: search.challengeId }
        : {}),
      ...(redirect === undefined ? {} : { redirect }),
      ...(typeof search.token === 'string' ? { token: search.token } : {}),
    };
  },
});

function EmailLinkConfirmRoute() {
  const { challengeId, redirect, token } = Route.useSearch();
  return (
    <EmailLinkConfirmPageContainer
      {...(challengeId === undefined ? {} : { challengeId })}
      {...(redirect === undefined ? {} : { redirectTo: redirect })}
      {...(token === undefined ? {} : { token })}
    />
  );
}

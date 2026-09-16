/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { EmailChallengePageContainer } from '@/features/identity/components/email-challenge/EmailChallengePageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function EmailChallengePage(
  props: ComponentProps<typeof EmailChallengePageContainer>,
) {
  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <EmailChallengePageContainer {...props} />
    </main>
  );
}

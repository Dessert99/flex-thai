/** 기능 화면을 조립하는 페이지 진입점 */
import { TotpSetupPageContainer } from '@/features/identity/components/totp-setup/TotpSetupPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function TotpSetupPage() {
  return (
    <section className='grid min-h-state place-items-center p-page'>
      <TotpSetupPageContainer />
    </section>
  );
}

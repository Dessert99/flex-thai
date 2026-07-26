/** scanner-safe 이메일 링크의 명시적 확인 UI를 표현한다 */
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/ui/card';

interface EmailLinkConfirmPageViewProps {
  errorMessage?: string;
  invalidLink: boolean;
  onConfirm: () => void;
  pending: boolean;
}

/** mount 시 network 동작 없이 확인 button만 제공한다 */
export function EmailLinkConfirmPageView({
  errorMessage,
  invalidLink,
  onConfirm,
  pending,
}: EmailLinkConfirmPageViewProps) {
  return (
    <>
      <meta
        content='no-referrer'
        name='referrer'
      />
      <main className='grid min-h-screen place-items-center bg-surface p-page'>
        <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
          <CardHeader>
            <h1 className='text-title text-primary'>로그인 확인</h1>
            <CardDescription className='text-body text-subtle'>
              아래 button을 눌러야 로그인 링크가 사용됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-section'>
            {invalidLink ? (
              <p className='text-body text-danger'>
                로그인 링크가 올바르지 않습니다.
              </p>
            ) : null}
            {errorMessage ? (
              <p
                aria-live='polite'
                className='text-body text-danger'
              >
                {errorMessage}
              </p>
            ) : null}
            <Button
              disabled={invalidLink || pending}
              onClick={onConfirm}
              type='button'
            >
              {pending ? '확인 중' : '로그인 확인'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

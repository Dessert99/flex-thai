import { useEmailLinkConfirm } from '@/features/identity/hooks/email-link-confirm/useEmailLinkConfirm';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/components/card';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function EmailLinkConfirmPage(
  pageInput: Parameters<typeof useEmailLinkConfirm>[0],
) {
  const { errorMessage, invalidLink, onConfirm, pending } =
    useEmailLinkConfirm(pageInput);

  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <>
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
      </>
    </main>
  );
}

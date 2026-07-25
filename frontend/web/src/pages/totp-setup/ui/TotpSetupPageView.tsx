/** 서버 secret만 표시하고 TOTP 등록 확인 form을 렌더링한다 */
import type { FormEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { LogoutButton } from '@/features/logout';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import type { TotpSetupFormInput } from '../model/totpSetupFormSchema';

interface TotpSetupPageViewProps {
  form: UseFormReturn<TotpSetupFormInput>;
  onStart: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pendingSetup: boolean;
  pendingVerify: boolean;
  requestId?: string;
  secretCode?: string;
  setupError: boolean;
}

/** TOTP enrollment 단계와 안전한 feedback을 표시한다 */
export function TotpSetupPageView({
  form,
  onStart,
  onSubmit,
  pendingSetup,
  pendingVerify,
  requestId,
  secretCode,
  setupError,
}: TotpSetupPageViewProps) {
  return (
    <main className='grid min-h-screen place-items-center bg-surface p-page'>
      <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
        <CardHeader>
          <h1 className='text-title text-primary'>관리자 2단계 인증 등록</h1>
          <CardDescription className='text-body text-subtle'>
            인증 앱에 secret을 직접 등록한 뒤 6자리 코드를 확인하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-section'>
          {secretCode === undefined ? (
            <Button
              disabled={pendingSetup}
              onClick={onStart}
              type='button'
            >
              {pendingSetup ? '준비 중' : '등록 시작'}
            </Button>
          ) : (
            <>
              <section
                aria-label='TOTP secret'
                className='rounded-panel border border-default bg-surface-muted p-page'
              >
                <p className='text-caption text-subtle'>인증 앱 secret</p>
                <p className='break-all font-mono text-body text-primary'>
                  {secretCode}
                </p>
              </section>
              <Form {...form}>
                <form
                  className='flex flex-col gap-section'
                  noValidate
                  onSubmit={onSubmit}
                >
                  <FormField
                    control={form.control}
                    name='code'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>인증 코드</FormLabel>
                        <FormControl>
                          <Input
                            autoComplete='one-time-code'
                            inputMode='numeric'
                            maxLength={6}
                            pattern='[0-9]*'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    disabled={pendingVerify}
                    type='submit'
                  >
                    {pendingVerify ? '확인 중' : '등록 완료'}
                  </Button>
                </form>
              </Form>
            </>
          )}
          {setupError ? (
            <p className='text-body text-danger'>
              등록을 시작하지 못했습니다. 다시 시도해 주세요.
            </p>
          ) : null}
          {requestId ? (
            <p className='text-caption text-danger'>요청 ID: {requestId}</p>
          ) : null}
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

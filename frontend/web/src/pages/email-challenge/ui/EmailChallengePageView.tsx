/** 이메일 code 입력과 resend countdown을 표현한다 */
import type { VerifyEmailCodeInput } from '@flex-thia/contracts';
import type { FormEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
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

interface EmailChallengePageViewProps {
  email?: string;
  errorMessage?: string;
  form: UseFormReturn<VerifyEmailCodeInput>;
  onResend: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  resendPending: boolean;
  resendSeconds: number;
}

/** code 제출과 cooldown 상태를 키보드 접근 가능한 form으로 렌더링한다 */
export function EmailChallengePageView({
  email,
  errorMessage,
  form,
  onResend,
  onSubmit,
  pending,
  resendPending,
  resendSeconds,
}: EmailChallengePageViewProps) {
  return (
    <main className='grid min-h-screen place-items-center bg-surface p-page'>
      <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
        <CardHeader>
          <h1 className='text-title text-primary'>이메일 인증</h1>
          <CardDescription className='text-body text-subtle'>
            {email
              ? `${email}로 보낸 6자리 코드를 입력하세요.`
              : '로그인 화면에서 인증 메일을 다시 요청해 주세요.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {errorMessage ? (
                <p
                  aria-live='polite'
                  className='text-body text-danger'
                >
                  {errorMessage}
                </p>
              ) : null}
              <Button
                disabled={pending || !email}
                type='submit'
              >
                {pending ? '확인 중' : '로그인'}
              </Button>
              <Button
                disabled={resendSeconds > 0 || resendPending || !email}
                onClick={onResend}
                type='button'
                variant='outline'
              >
                {resendPending ? '재전송 중' : '인증 메일 재전송'}
              </Button>
              {resendSeconds > 0 ? (
                <p className='text-caption text-subtle'>
                  {resendSeconds}초 후 재전송 가능
                </p>
              ) : null}
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}

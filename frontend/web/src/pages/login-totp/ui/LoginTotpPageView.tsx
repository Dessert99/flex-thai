/** 로그인 TOTP의 접근 가능한 숫자 입력과 inline feedback을 렌더링한다 */
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
import type { LoginTotpFormInput } from '../model/loginTotpFormSchema';

interface LoginTotpPageViewProps {
  form: UseFormReturn<LoginTotpFormInput>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  requestId?: string;
}

/** 로그인 TOTP form을 semantic Card 안에 표시한다 */
export function LoginTotpPageView({
  form,
  onSubmit,
  pending,
  requestId,
}: LoginTotpPageViewProps) {
  return (
    <main className='grid min-h-screen place-items-center bg-surface p-page'>
      <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
        <CardHeader>
          <h1 className='text-title text-primary'>2단계 인증</h1>
          <CardDescription className='text-body text-subtle'>
            인증 앱에 표시된 6자리 코드를 입력하세요.
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
                        pattern='[0-9]*'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {requestId ? (
                <p className='text-caption text-danger'>요청 ID: {requestId}</p>
              ) : null}
              <Button
                disabled={pending}
                type='submit'
              >
                {pending ? '인증 중' : '인증하기'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}

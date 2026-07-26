/** 키보드 접근 가능한 학교 이메일 form과 안전한 feedback을 렌더링한다 */
import type { StartEmailAuthenticationInput } from '@flex-thia/contracts';
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

interface LoginPageViewProps {
  form: UseFormReturn<StartEmailAuthenticationInput>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  requestId?: string;
}

/** 로그인 입력과 inline 오류를 semantic form으로 표시한다 */
export function LoginPageView({
  form,
  onSubmit,
  pending,
  requestId,
}: LoginPageViewProps) {
  return (
    <main className='grid min-h-screen place-items-center bg-surface p-page'>
      <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
        <CardHeader>
          <h1 className='text-title text-primary'>로그인</h1>
          <CardDescription className='text-body text-subtle'>
            FLEX 태국어 학습을 계속하세요.
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
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>학교 이메일</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete='email'
                        inputMode='email'
                        type='email'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root?.message ? (
                <div
                  aria-live='polite'
                  className='text-body text-danger'
                >
                  <p>{form.formState.errors.root.message}</p>
                  {requestId ? (
                    <p className='text-caption'>요청 ID: {requestId}</p>
                  ) : null}
                </div>
              ) : null}
              <Button
                disabled={pending}
                type='submit'
              >
                {pending ? '메일 보내는 중' : '인증 메일 받기'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}

import { useLogin } from '@/features/identity/hooks/login/useLogin';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/components/card';
import { Field, FieldError, FieldLabel } from '@/shared/components/field';
import { Input } from '@/shared/components/input';
import { useId } from 'react';
import { Controller } from 'react-hook-form';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function LoginPage(pageInput: Parameters<typeof useLogin>[0]) {
  const { form, onSubmit, pending, requestId } = useLogin(pageInput);

  const inputId = useId();

  const errorId = `${inputId}-error`;

  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <>
        <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
          <CardHeader>
            <h1 className='text-title text-primary'>로그인</h1>
            <CardDescription className='text-body text-subtle'>
              FLEX 태국어 학습을 계속하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className='flex flex-col gap-section'
              noValidate
              onSubmit={onSubmit}
            >
              <Controller
                control={form.control}
                name='email'
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={inputId}>학교 이메일</FieldLabel>

                    <Input
                      id={inputId}
                      aria-invalid={fieldState.invalid}
                      aria-describedby={fieldState.error ? errorId : undefined}
                      autoComplete='email'
                      inputMode='email'
                      type='email'
                      {...field}
                    />

                    {fieldState.error && (
                      <FieldError
                        id={errorId}
                        errors={[fieldState.error]}
                      />
                    )}
                  </Field>
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
          </CardContent>
        </Card>
      </>
    </main>
  );
}

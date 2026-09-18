import { useLoginTotp } from '@/features/identity/hooks/login-totp/useLoginTotp';
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

export function LoginTotpPage(pageInput: Parameters<typeof useLoginTotp>[0]) {
  const { form, onSubmit, pending, requestId } = useLoginTotp(pageInput);

  const inputId = useId();

  const errorId = `${inputId}-error`;

  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <>
        <Card className='w-full max-w-form border-default bg-surface shadow-overlay'>
          <CardHeader>
            <h1 className='text-title text-primary'>2단계 인증</h1>
            <CardDescription className='text-body text-subtle'>
              인증 앱에 표시된 6자리 코드를 입력하세요.
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
                name='code'
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={inputId}>인증 코드</FieldLabel>

                    <Input
                      id={inputId}
                      aria-invalid={fieldState.invalid}
                      aria-describedby={fieldState.error ? errorId : undefined}
                      autoComplete='one-time-code'
                      inputMode='numeric'
                      maxLength={6}
                      pattern='[0-9]*'
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
          </CardContent>
        </Card>
      </>
    </main>
  );
}

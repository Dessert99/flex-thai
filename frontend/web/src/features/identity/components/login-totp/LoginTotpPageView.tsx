/** 로그인 TOTP의 접근 가능한 숫자 입력과 inline feedback을 렌더링한다 */
import { useId, type FormEventHandler } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/components/card';
import { Field, FieldLabel, FieldError } from '@/shared/components/field';
import { Input } from '@/shared/components/input';
import type { LoginTotpFormInput } from '../../libs/login-totp/loginTotpFormSchema';

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
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
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
  );
}

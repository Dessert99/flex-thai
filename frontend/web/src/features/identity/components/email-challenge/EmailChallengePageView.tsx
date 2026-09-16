/** 이메일 code 입력과 resend countdown을 표현한다 */
import type { VerifyEmailCodeInput } from '@flex-thia/contracts/identity/auth';
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
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
    <>
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
        </CardContent>
      </Card>
    </>
  );
}

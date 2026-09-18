import { useTotpSetup } from '@/features/identity/hooks/totp-setup/useTotpSetup';
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

export function TotpSetupPage() {
  const {
    form,
    onStart,
    onSubmit,
    pendingSetup,
    pendingVerify,
    requestId,
    secretCode,
    setupError,
  } = useTotpSetup();

  const inputId = useId();

  const errorId = `${inputId}-error`;

  return (
    <section className='grid min-h-state place-items-center p-page'>
      <>
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
                          aria-describedby={
                            fieldState.error ? errorId : undefined
                          }
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
                  <Button
                    disabled={pendingVerify}
                    type='submit'
                  >
                    {pendingVerify ? '확인 중' : '등록 완료'}
                  </Button>
                </form>
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
          </CardContent>
        </Card>
      </>
    </section>
  );
}

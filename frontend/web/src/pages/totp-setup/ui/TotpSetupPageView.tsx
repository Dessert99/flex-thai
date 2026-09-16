/** 서버 secret만 표시하고 TOTP 등록 확인 form을 렌더링한다 */
import { useId, type FormEventHandler } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/ui/card';
import { Field, FieldLabel, FieldError } from '@/shared/ui/field';
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
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
    <section className='grid min-h-state place-items-center p-page'>
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
    </section>
  );
}

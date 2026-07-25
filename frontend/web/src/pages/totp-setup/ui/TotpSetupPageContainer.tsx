/** TOTP secret 생성과 등록 확인 mutation lifecycle을 소유한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { beginTotpSetup, isApiError, verifyTotpSetup } from '@/shared/api';
import {
  totpSetupFormSchema,
  type TotpSetupFormInput,
} from '../model/totpSetupFormSchema';
import { TotpSetupPageView } from './TotpSetupPageView';

/** 관리자 TOTP enrollment 시작과 검증을 Page View에 연결한다 */
export function TotpSetupPageContainer() {
  const navigate = useNavigate();
  const form = useForm<TotpSetupFormInput>({
    defaultValues: { code: '' },
    resolver: zodResolver(totpSetupFormSchema),
  });
  const setupMutation = useMutation({
    mutationFn: beginTotpSetup,
  });
  const verifyMutation = useMutation({
    mutationFn: verifyTotpSetup,
    onError() {
      form.setError('code', {
        message: '인증 코드를 확인해 주세요.',
      });
    },
    onSuccess() {
      void navigate({ replace: true, to: '/admin' });
      form.reset();
    },
  });
  const requestId = readRequestId(verifyMutation.error ?? setupMutation.error);
  const secretCode = setupMutation.data?.secretCode;

  return (
    <TotpSetupPageView
      onStart={() => setupMutation.mutate()}
      onSubmit={(event) => {
        void form.handleSubmit((input) => verifyMutation.mutate(input))(event);
      }}
      pendingSetup={setupMutation.isPending}
      pendingVerify={verifyMutation.isPending}
      setupError={setupMutation.isError}
      form={form}
      {...(requestId === undefined ? {} : { requestId })}
      {...(secretCode === undefined ? {} : { secretCode })}
    />
  );
}

function readRequestId(error: unknown) {
  return isApiError(error) && error.detail.kind === 'problem'
    ? error.detail.problem.requestId
    : undefined;
}

import {
  totpSetupFormSchema,
  type TotpSetupFormInput,
} from '@/features/identity/libs/totp-setup/totpSetupFormSchema';
import type { TotpSetupPageViewProps } from '@/features/identity/libs/totp-setup/totpSetupPageTypes';
import { isApiError } from '@/shared/apis/ApiError';
import {
  beginTotpSetup,
  verifyTotpSetup,
} from '@/shared/apis/auth/authSessionStore';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

function readRequestId(error: unknown) {
  return isApiError(error) && error.detail.kind === 'problem'
    ? error.detail.problem.requestId
    : undefined;
}
export function useTotpSetup(): TotpSetupPageViewProps {
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
  return {
    onStart: () => setupMutation.mutate(),
    onSubmit: (event) => {
      void form.handleSubmit((input) => verifyMutation.mutate(input))(event);
    },
    pendingSetup: setupMutation.isPending,
    pendingVerify: verifyMutation.isPending,
    setupError: setupMutation.isError,
    form: form,
    ...(requestId === undefined ? {} : { requestId }),
    ...(secretCode === undefined ? {} : { secretCode }),
  };
}

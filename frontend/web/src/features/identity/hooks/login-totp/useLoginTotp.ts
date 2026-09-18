import {
  loginTotpFormSchema,
  type LoginTotpFormInput,
} from '@/features/identity/libs/login-totp/loginTotpFormSchema';
import type { LoginTotpPageViewProps } from '@/features/identity/libs/login-totp/loginTotpPageTypes';
import { isApiError } from '@/shared/apis/ApiError';
import { completeLoginTotpSession } from '@/shared/apis/auth/authSessionStore';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

interface LoginTotpPageContainerProps {
  redirectTo?: string;
}

function readRequestId(error: unknown) {
  return isApiError(error) && error.detail.kind === 'problem'
    ? error.detail.problem.requestId
    : undefined;
}

function withRequestId(error: unknown) {
  const requestId = readRequestId(error);
  return requestId === undefined ? {} : { requestId };
}
export function useLoginTotp({
  redirectTo,
}: LoginTotpPageContainerProps): LoginTotpPageViewProps {
  const navigate = useNavigate();

  const form = useForm<LoginTotpFormInput>({
    defaultValues: { code: '' },
    resolver: zodResolver(loginTotpFormSchema),
  });

  const mutation = useMutation({
    mutationFn: ({ code }: LoginTotpFormInput) =>
      completeLoginTotpSession(code),
    onError() {
      form.setError('code', {
        message: '인증 코드를 확인해 주세요.',
      });
    },
    onSuccess() {
      void navigate({
        replace: true,
        to: (redirectTo ?? '/learn') as never,
      });
      form.reset();
    },
  });
  return {
    form: form,
    onSubmit: (event) => {
      void form.handleSubmit((input) => mutation.mutate(input))(event);
    },
    pending: mutation.isPending,
    ...withRequestId(mutation.error),
  };
}

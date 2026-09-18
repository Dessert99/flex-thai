import { loginFormSchema } from '@/features/identity/libs/login/loginFormSchema';
import type { LoginPageViewProps } from '@/features/identity/libs/login/loginPageTypes';
import { isApiError } from '@/shared/apis/ApiError';
import { startEmailAuthenticationSession } from '@/shared/apis/auth/authSessionStore';
import type { StartEmailAuthenticationInput } from '@flex-thia/contracts/identity/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

interface LoginPageContainerProps {
  redirectTo?: string;
}

function getLoginErrorMessage(error: unknown) {
  if (isApiError(error) && error.detail.kind === 'problem') {
    return '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
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
export function useLogin({
  redirectTo,
}: LoginPageContainerProps): LoginPageViewProps {
  const navigate = useNavigate();

  const form = useForm<StartEmailAuthenticationInput>({
    defaultValues: { email: '' },
    resolver: zodResolver(loginFormSchema),
  });

  const mutation = useMutation({
    mutationFn: (input: StartEmailAuthenticationInput) =>
      startEmailAuthenticationSession(input.email),
    onError(error) {
      form.setError('root', {
        message: getLoginErrorMessage(error),
      });
    },
    onSuccess() {
      if (redirectTo === undefined) {
        void navigate({ to: '/login/challenge' });
        form.reset();
        return;
      }
      void navigate({
        search: { redirect: redirectTo },
        to: '/login/challenge',
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

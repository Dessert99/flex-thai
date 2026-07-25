/** 로그인 mutation 결과를 MFA 또는 인증 완료 navigation으로 연결한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import type { LoginInput, MeResponse } from '@flex-thia/contracts';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import {
  isApiError,
  loginSession,
  type LoginSessionResult,
} from '@/shared/api';
import { loginFormSchema } from '../model/loginFormSchema';
import { LoginPageView } from './LoginPageView';

interface LoginPageContainerProps {
  redirectTo?: string;
}

/** 로그인 form과 mutation lifecycle을 소유한다 */
export function LoginPageContainer({ redirectTo }: LoginPageContainerProps) {
  const navigate = useNavigate();
  const form = useForm<LoginInput>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginFormSchema),
  });
  const mutation = useMutation({
    mutationFn: loginSession,
    onError(error) {
      form.setError('root', {
        message: getLoginErrorMessage(error),
      });
    },
    onSuccess(result) {
      const destination = getLoginDestination(result, redirectTo);
      void navigate({ replace: true, to: destination as never });
      form.reset();
    },
  });

  return (
    <LoginPageView
      form={form}
      onSubmit={(event) => {
        void form.handleSubmit((input) => mutation.mutate(input))(event);
      }}
      pending={mutation.isPending}
      {...withRequestId(mutation.error)}
    />
  );
}

function getLoginDestination(
  result: LoginSessionResult,
  redirectTo: string | undefined,
) {
  if (result.status === 'mfa-required') {
    return '/login/mfa';
  }
  if (redirectTo !== undefined) {
    return redirectTo;
  }

  return getUserHome(result.user);
}

function getUserHome(user: MeResponse) {
  if (user.role === 'LEARNER') {
    return '/learn';
  }
  return user.mfaEnrolled ? '/admin' : '/admin/totp-setup';
}

function getLoginErrorMessage(error: unknown) {
  if (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.code === 'INVALID_CREDENTIALS'
  ) {
    return '이메일 또는 비밀번호를 확인해 주세요.';
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

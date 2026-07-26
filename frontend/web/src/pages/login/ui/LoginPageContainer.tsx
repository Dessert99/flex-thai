/** 학교 이메일 challenge 시작을 코드 입력 navigation으로 연결한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import type { StartEmailAuthenticationInput } from '@flex-thia/contracts';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { isApiError, startEmailAuthenticationSession } from '@/shared/api';
import { loginFormSchema } from '../model/loginFormSchema';
import { LoginPageView } from './LoginPageView';

interface LoginPageContainerProps {
  redirectTo?: string;
}

/** 로그인 form과 mutation lifecycle을 소유한다 */
export function LoginPageContainer({}: LoginPageContainerProps) {
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
      void navigate({ to: '/login/challenge' as never });
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

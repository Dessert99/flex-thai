/** 로그인 TOTP mutation을 인증 완료 navigation과 연결한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import type { MeResponse } from '@flex-thia/contracts';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { completeLoginTotpSession, isApiError } from '@/shared/api';
import {
  loginTotpFormSchema,
  type LoginTotpFormInput,
} from '../model/loginTotpFormSchema';
import { LoginTotpPageView } from './LoginTotpPageView';

interface LoginTotpPageContainerProps {
  redirectTo?: string;
}

/** 로그인 TOTP form과 mutation lifecycle을 소유한다 */
export function LoginTotpPageContainer({
  redirectTo,
}: LoginTotpPageContainerProps) {
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
    onSuccess(result) {
      void navigate({
        replace: true,
        to: (redirectTo ?? getUserHome(result.user)) as never,
      });
      form.reset();
    },
  });

  return (
    <LoginTotpPageView
      form={form}
      onSubmit={(event) => {
        void form.handleSubmit((input) => mutation.mutate(input))(event);
      }}
      pending={mutation.isPending}
      {...withRequestId(mutation.error)}
    />
  );
}

function getUserHome(user: MeResponse) {
  if (user.role === 'LEARNER') {
    return '/learn' as const;
  }
  return user.mfaEnrolled
    ? ('/admin' as const)
    : ('/admin/totp-setup' as const);
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

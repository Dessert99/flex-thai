/** 이메일 code·resend mutation을 인증 navigation으로 연결한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import type { MeResponse, VerifyEmailCodeInput } from '@flex-thia/contracts';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  getPendingEmailChallenge,
  resendPendingEmailChallenge,
  verifyEmailCodeSession,
} from '@/shared/api';
import { emailCodeFormSchema } from '../model/emailCodeFormSchema';
import { EmailChallengePageView } from './EmailChallengePageView';

interface EmailChallengePageContainerProps {
  redirectTo?: string;
}

/** pending challenge의 code와 cooldown을 화면 수명 동안 소유한다 */
export function EmailChallengePageContainer({
  redirectTo,
}: EmailChallengePageContainerProps) {
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(getPendingEmailChallenge);
  const [now, setNow] = useState(Date.now);
  const form = useForm<VerifyEmailCodeInput>({
    defaultValues: { code: '' },
    resolver: zodResolver(emailCodeFormSchema),
  });
  const verifyMutation = useMutation({
    mutationFn: ({ code }: VerifyEmailCodeInput) =>
      verifyEmailCodeSession(code),
    onSuccess(result) {
      if (result.status === 'mfa-required') {
        if (redirectTo === undefined) {
          void navigate({ replace: true, to: '/login/mfa' });
          return;
        }
        void navigate({
          replace: true,
          search: { redirect: redirectTo },
          to: '/login/mfa',
        });
        return;
      }
      void navigate({
        replace: true,
        to: (redirectTo ?? getUserHome(result.user)) as never,
      });
    },
  });
  const resendMutation = useMutation({
    mutationFn: resendPendingEmailChallenge,
    onSuccess(nextChallenge) {
      setChallenge(nextChallenge);
      setNow(Date.now());
    },
  });
  const resendSeconds = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAt) - now) / 1_000))
    : 0;

  useEffect(() => {
    if (resendSeconds === 0) return undefined;
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1_000);
    return () => globalThis.clearInterval(timer);
  }, [resendSeconds]);

  const errorMessage =
    verifyMutation.error || resendMutation.error
      ? '인증 요청을 처리하지 못했습니다. 다시 시도해 주세요.'
      : undefined;

  return (
    <EmailChallengePageView
      form={form}
      onResend={() => resendMutation.mutate()}
      onSubmit={(event) => {
        void form.handleSubmit((input) => verifyMutation.mutate(input))(event);
      }}
      pending={verifyMutation.isPending}
      resendPending={resendMutation.isPending}
      resendSeconds={resendSeconds}
      {...(challenge ? { email: challenge.email } : {})}
      {...(errorMessage ? { errorMessage } : {})}
    />
  );
}

const getUserHome = (user: MeResponse): string => {
  if (user.role === 'LEARNER') return '/learn';
  return user.mfaEnrolled ? '/admin' : '/admin/totp-setup';
};

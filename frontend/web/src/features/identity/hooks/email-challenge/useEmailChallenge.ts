import type { EmailChallengePageViewProps } from '@/features/identity/libs/email-challenge/emailChallengePageTypes';
import { emailCodeFormSchema } from '@/features/identity/libs/email-challenge/emailCodeFormSchema';
import {
  getPendingEmailChallenge,
  resendPendingEmailChallenge,
  verifyEmailCodeSession,
} from '@/shared/apis/auth/authSessionStore';
import type { VerifyEmailCodeInput } from '@flex-thia/contracts/identity/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

interface EmailChallengePageContainerProps {
  redirectTo?: string;
}
export function useEmailChallenge({
  redirectTo,
}: EmailChallengePageContainerProps): EmailChallengePageViewProps {
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
        to: (redirectTo ?? '/learn') as never,
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
  return {
    form: form,
    onResend: () => resendMutation.mutate(),
    onSubmit: (event) => {
      void form.handleSubmit((input) => verifyMutation.mutate(input))(event);
    },
    pending: verifyMutation.isPending,
    resendPending: resendMutation.isPending,
    resendSeconds: resendSeconds,
    ...(challenge ? { email: challenge.email } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

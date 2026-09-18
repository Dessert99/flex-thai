import type { EmailLinkConfirmPageViewProps } from '@/features/identity/libs/email-link-confirm/emailLinkConfirmPageTypes';
import { confirmEmailLinkSession } from '@/shared/apis/auth/authSessionStore';
import {
  confirmEmailLinkRequestSchema,
  emailChallengeIdPathSchema,
} from '@flex-thia/contracts/identity/auth';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

interface EmailLinkConfirmPageContainerProps {
  challengeId?: string;
  redirectTo?: string;
  token?: string;
}
export function useEmailLinkConfirm({
  challengeId,
  redirectTo,
  token,
}: EmailLinkConfirmPageContainerProps): EmailLinkConfirmPageViewProps {
  const navigate = useNavigate();

  const parameters = new URLSearchParams(globalThis.location.search);

  const parsedPath = emailChallengeIdPathSchema.safeParse({
    challengeId: challengeId ?? parameters.get('challengeId'),
  });

  const parsedBody = confirmEmailLinkRequestSchema.safeParse({
    token: token ?? parameters.get('token'),
  });

  const validInput =
    parsedPath.success && parsedBody.success
      ? { ...parsedPath.data, ...parsedBody.data }
      : undefined;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!validInput) throw new Error('로그인 링크가 올바르지 않습니다.');
      return confirmEmailLinkSession(validInput.challengeId, validInput.token);
    },
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

  const errorMessage = mutation.error
    ? '로그인 링크를 확인하지 못했습니다. 다시 시도해 주세요.'
    : undefined;
  return {
    invalidLink: !validInput,
    onConfirm: () => mutation.mutate(),
    pending: mutation.isPending,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

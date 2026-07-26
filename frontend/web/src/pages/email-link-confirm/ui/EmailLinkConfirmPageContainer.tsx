/** URL token을 button click 뒤에만 POST하고 인증 navigation으로 연결한다 */
import {
  confirmEmailLinkRequestSchema,
  emailChallengeIdPathSchema,
  type MeResponse,
} from '@flex-thia/contracts';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { confirmEmailLinkSession } from '@/shared/api';
import { EmailLinkConfirmPageView } from './EmailLinkConfirmPageView';

/** scanner GET과 실제 로그인 POST 사이의 명시적 사용자 동작을 소유한다 */
export function EmailLinkConfirmPageContainer() {
  const navigate = useNavigate();
  const parameters = new URLSearchParams(globalThis.location.search);
  const parsedPath = emailChallengeIdPathSchema.safeParse({
    challengeId: parameters.get('challengeId'),
  });
  const parsedBody = confirmEmailLinkRequestSchema.safeParse({
    token: parameters.get('token'),
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
      const destination =
        result.status === 'mfa-required'
          ? '/login/mfa'
          : getUserHome(result.user);
      void navigate({ replace: true, to: destination as never });
    },
  });
  const errorMessage = mutation.error
    ? '로그인 링크를 확인하지 못했습니다. 다시 시도해 주세요.'
    : undefined;

  return (
    <EmailLinkConfirmPageView
      invalidLink={!validInput}
      onConfirm={() => mutation.mutate()}
      pending={mutation.isPending}
      {...(errorMessage ? { errorMessage } : {})}
    />
  );
}

const getUserHome = (user: MeResponse): string => {
  if (user.role === 'LEARNER') return '/learn';
  return user.mfaEnrolled ? '/admin' : '/admin/totp-setup';
};

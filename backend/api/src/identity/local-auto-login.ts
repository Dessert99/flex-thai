/** 로컬 개발에서만 이메일·TOTP 입력 없이 실제 사용자 세션을 만든다 */
import type { ApiEnv } from '@flex-thia/config/api-env';
import {
  IdentityAuthenticationService,
  IdentityDomainError,
  type AuthenticationResult,
} from '@flex-thia/domain/identity/authentication.service';
import type { FakePasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/fake-passwordless-authentication.provider';

export const LOCAL_AUTO_LOGIN = Symbol('LOCAL_AUTO_LOGIN');
export type LocalAutoLogin = (
  refreshToken?: string,
) => Promise<AuthenticationResult>;

/** 검증된 로컬 환경에서만 자동 세션 복원 함수를 제공한다 */
export function createLocalAutoLogin(
  env: ApiEnv,
  provider: FakePasswordlessAuthenticationProvider | undefined,
  identity: IdentityAuthenticationService,
): LocalAutoLogin | undefined {
  if (!env.LOCAL_AUTO_LOGIN) return undefined;
  if (
    env.NODE_ENV !== 'development' ||
    env.AUTH_MODE !== 'fake' ||
    env.DATABASE_MODE !== 'local' ||
    !provider
  ) {
    throw new Error(
      '자동 로그인은 로컬 개발용 fake 인증에서만 사용할 수 있습니다',
    );
  }

  const authenticate = async (
    refreshToken?: string,
  ): Promise<AuthenticationResult> => {
    if (refreshToken) {
      try {
        return await identity.refresh(refreshToken);
      } catch (error) {
        // API 재시작으로 사라진 fake token만 새 개발 세션으로 교체한다.
        if (
          !(error instanceof IdentityDomainError) ||
          error.code !== 'INVALID_REFRESH_TOKEN'
        ) {
          throw error;
        }
      }
    }

    const result = await provider.complete(env.FAKE_LEARNER_EMAIL);
    return result.kind === 'MFA_REQUIRED'
      ? identity.completeTotpChallenge({
          email: env.FAKE_LEARNER_EMAIL,
          challengeToken: result.challengeToken,
          code: '123456',
        })
      : identity.completePasswordless(result);
  };

  return authenticate;
}

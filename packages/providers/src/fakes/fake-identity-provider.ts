/** Cognito 없이 passwordless session과 token 응답을 재현한다 */
import { randomUUID } from 'node:crypto';
import type { IdentityProvider, TokenSet } from '@flex-thia/domain';

/** 호출 기록과 고정 token을 제공하는 fake identity provider */
export class FakeIdentityProvider implements IdentityProvider {
  readonly users = new Set<string>();
  readonly revokedTokens = new Set<string>();

  constructor(
    private readonly tokens: TokenSet = {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresIn: 3600,
      subject: 'fake-subject',
      email: 'student@school.ac.kr',
    },
    private readonly onStart?: (input: {
      challengeId: string;
      email: string;
    }) => Promise<void>,
  ) {}

  /** 처음 본 이메일도 message 없이 fake 사용자로 준비한다 */
  ensureUser(email: string): Promise<void> {
    this.users.add(email);
    return Promise.resolve();
  }

  /** 다른 브라우저에서도 연결할 challenge id와 session을 만든다 */
  async start(
    email: string,
  ): Promise<{ challengeId: string; session: string }> {
    const challengeId = randomUUID();
    await this.onStart?.({ challengeId, email });
    return {
      challengeId,
      session: randomUUID(),
    };
  }

  /** fake 환경에서는 trigger 검증이 끝났다고 보고 고정 token을 반환한다 */
  respond(): Promise<TokenSet> {
    return Promise.resolve(this.tokens);
  }

  /** refresh cookie 흐름을 AWS 없이 검증할 고정 token을 반환한다 */
  refresh(): Promise<TokenSet> {
    return Promise.resolve(this.tokens);
  }

  /** logout 테스트에서 폐기한 refresh token만 기록한다 */
  revoke(refreshToken: string): Promise<void> {
    this.revokedTokens.add(refreshToken);
    return Promise.resolve();
  }
}

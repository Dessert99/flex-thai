/** Cognito 없이 비밀번호 원문을 남기지 않는 local identity를 재현한다 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  IdentityProviderError,
  type IdentityProvider,
  type TokenSet,
} from '@flex-thia/domain';

const hashPassword = (password: string, salt = randomBytes(16)) => ({
  salt,
  digest: scryptSync(password, salt, 32),
});

/** local 개발에서도 메모리에 비밀번호 평문을 저장하지 않는 fake provider */
export class FakeIdentityProvider implements IdentityProvider {
  private readonly users = new Map<string, { salt: Buffer; digest: Buffer }>();
  readonly revokedTokens = new Set<string>();

  constructor(
    private readonly tokens: TokenSet = {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresIn: 3600,
      subject: 'fake-subject',
      email: 'student@hufs.ac.kr',
    },
  ) {}

  /** local 계정 존재 여부만 반환한다 */
  userExists(email: string): Promise<boolean> {
    return Promise.resolve(this.users.has(email));
  }

  /** local 가입에서도 scrypt 결과만 메모리에 남긴다 */
  createVerifiedUser(email: string, password: string): Promise<TokenSet> {
    if (this.users.has(email)) {
      return Promise.reject(new IdentityProviderError('ACCOUNT_EXISTS'));
    }
    this.users.set(email, hashPassword(password));
    return Promise.resolve({ ...this.tokens, email });
  }

  /** 입력 비밀번호를 같은 salt로 해시해 constant-time으로 비교한다 */
  login(email: string, password: string): Promise<TokenSet> {
    const stored = this.users.get(email);
    const actual = stored ? scryptSync(password, stored.salt, 32) : null;
    if (!stored || !actual || !timingSafeEqual(stored.digest, actual)) {
      return Promise.reject(new IdentityProviderError('INVALID_CREDENTIALS'));
    }
    return Promise.resolve({ ...this.tokens, email });
  }

  /** 인증된 local 계정의 scrypt 결과만 교체한다 */
  setPassword(email: string, newPassword: string): Promise<void> {
    if (!this.users.has(email)) {
      return Promise.reject(new Error('계정을 찾을 수 없습니다'));
    }
    this.users.set(email, hashPassword(newPassword));
    return Promise.resolve();
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

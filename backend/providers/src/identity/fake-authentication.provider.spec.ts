/** local fake의 비밀번호·TOTP·refresh 수명주기를 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeAuthenticationProvider } from './fake-authentication.provider.js';

const createProvider = () =>
  new FakeAuthenticationProvider({
    accounts: [
      {
        email: 'admin@example.com',
        password: 'Strong1!',
        subject: 'admin-sub',
        requireTotp: true,
      },
      {
        email: 'learner@example.com',
        password: 'Strong1!',
        subject: 'learner-sub',
        requireTotp: false,
      },
    ],
  });

describe('FakeAuthenticationProvider', () => {
  it('올바른 비밀번호 뒤에는 설정에 따라 TOTP challenge를 요구한다', async () => {
    const provider = createProvider();

    await expect(
      provider.login('admin@example.com', 'Strong1!'),
    ).resolves.toMatchObject({ kind: 'MFA_REQUIRED' });
    await expect(
      provider.login('admin@example.com', 'wrong'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('고정 TOTP code로 challenge를 완료한다', async () => {
    const provider = createProvider();
    const challenge = await provider.login('admin@example.com', 'Strong1!');

    if (challenge.kind !== 'MFA_REQUIRED') {
      throw new Error('TOTP challenge가 필요합니다');
    }

    await expect(
      provider.completeTotpChallenge({
        email: 'admin@example.com',
        challengeToken: challenge.challengeToken,
        code: '123456',
      }),
    ).resolves.toMatchObject({
      subject: 'admin-sub',
      email: 'admin@example.com',
    });
  });

  it('학생은 MFA 없이 자신의 subject로 로그인한다', async () => {
    const provider = createProvider();
    const result = await provider.login('learner@example.com', 'Strong1!');

    expect(result).toMatchObject({
      kind: 'AUTHENTICATED',
      tokens: {
        subject: 'learner-sub',
        email: 'learner@example.com',
      },
    });
    if (result.kind !== 'AUTHENTICATED') {
      throw new Error('즉시 인증 결과가 필요합니다');
    }
    expect(provider.resolveAccessTokenSubject(result.tokens.accessToken)).toBe(
      'learner-sub',
    );
  });

  it('refresh할 때마다 새 token suffix를 발급한다', async () => {
    const provider = createProvider();
    const login = await provider.login('learner@example.com', 'Strong1!');

    if (login.kind !== 'AUTHENTICATED') {
      throw new Error('즉시 인증 결과가 필요합니다');
    }

    const first = await provider.refresh(login.tokens.refreshToken);
    const second = await provider.refresh(first.refreshToken);

    expect(first.refreshToken).not.toBe(login.tokens.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second).toMatchObject({
      subject: 'learner-sub',
      email: 'learner@example.com',
    });
    expect(provider.resolveAccessTokenSubject(second.accessToken)).toBe(
      'learner-sub',
    );
    expect(provider.resolveAccessTokenSubject('unknown')).toBeUndefined();
  });

  it('폐기한 refresh token은 재사용하지 못한다', async () => {
    const provider = createProvider();
    const login = await provider.login('learner@example.com', 'Strong1!');

    if (login.kind !== 'AUTHENTICATED') {
      throw new Error('즉시 인증 결과가 필요합니다');
    }

    await provider.revoke(login.tokens.refreshToken);

    await expect(
      provider.refresh(login.tokens.refreshToken),
    ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('TOTP 설정은 고정 secret과 code로 재현한다', async () => {
    const provider = createProvider();

    await expect(provider.startTotpSetup('access')).resolves.toEqual({
      secretCode: 'LOCALONLYTOTPSECRET',
    });
    await expect(
      provider.verifyTotpSetup('access', '123456'),
    ).resolves.toBeUndefined();
    await expect(
      provider.verifyTotpSetup('access', '000000'),
    ).rejects.toMatchObject({ code: 'INVALID_TOTP' });
  });
});

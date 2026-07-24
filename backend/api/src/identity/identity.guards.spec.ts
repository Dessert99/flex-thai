/** Identity guard의 access claim·역할 상속·MFA·CSRF 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from './admin-mfa.guard.js';
import { ApplicationRoleGuard } from './application-role.guard.js';
import { CognitoAuthorizerGuard } from './cognito-authorizer.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { writeRefreshCookie } from './refresh-cookie.js';

const createContext = (request: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as never;

describe('refresh cookie', () => {
  it('7일 Strict __Host- cookie로만 refresh token을 저장한다', () => {
    const response = { cookie: vi.fn() };

    writeRefreshCookie(response, 'refresh');

    expect(response.cookie).toHaveBeenCalledWith(
      '__Host-flex-thia-refresh',
      'refresh',
      {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    );
  });
});

describe('ApplicationRoleGuard', () => {
  it('ADMIN은 LEARNER 요구 route를 사용할 수 있다', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('LEARNER'),
    };
    const guard = new ApplicationRoleGuard(reflector as never);

    expect(
      guard.canActivate(
        createContext({
          user: {
            userId: 'user-id',
            sub: 'cognito-sub',
            email: 'admin@example.com',
            role: 'ADMIN',
            mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
          },
        }),
      ),
    ).toBe(true);
  });

  it('LEARNER는 ADMIN 요구 route를 사용할 수 없다', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('ADMIN'),
    };
    const guard = new ApplicationRoleGuard(reflector as never);

    expect(() =>
      guard.canActivate(
        createContext({
          user: {
            userId: 'user-id',
            sub: 'cognito-sub',
            email: 'learner@example.com',
            role: 'LEARNER',
            mfaEnrolledAt: null,
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('인증 사용자가 없으면 역할이 필요한 route를 사용할 수 없다', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('LEARNER'),
    };
    const guard = new ApplicationRoleGuard(reflector as never);

    expect(() => guard.canActivate(createContext({}))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });
});

describe('AdminMfaGuard', () => {
  it('ADMIN이 TOTP 등록 전이면 관리자 route를 거부한다', () => {
    const guard = new AdminMfaGuard();

    expect(() =>
      guard.canActivate(
        createContext({
          user: {
            userId: 'user-id',
            sub: 'cognito-sub',
            email: 'admin@example.com',
            role: 'ADMIN',
            mfaEnrolledAt: null,
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        status: 403,
        response: { code: 'MFA_ENROLLMENT_REQUIRED' },
      }),
    );
  });

  it('TOTP 등록을 마친 ADMIN은 관리자 route를 사용할 수 있다', () => {
    const guard = new AdminMfaGuard();

    expect(
      guard.canActivate(
        createContext({
          user: {
            userId: 'user-id',
            sub: 'cognito-sub',
            email: 'admin@example.com',
            role: 'ADMIN',
            mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
          },
        }),
      ),
    ).toBe(true);
  });
});

describe('CognitoAuthorizerGuard', () => {
  it('검증된 access claim을 최신 ACTIVE DB 사용자와 연결한다', async () => {
    const users = {
      findBySub: vi.fn().mockResolvedValue({
        id: 'user-id',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
      }),
    };
    const guard = new CognitoAuthorizerGuard(users as never, {
      authMode: 'cognito',
      cognitoClientId: 'client-id',
    });
    const request = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: 'cognito-sub',
              token_use: 'access',
              client_id: 'client-id',
            },
          },
        },
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        userId: 'user-id',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
    });
  });

  it.each([
    [
      'token_use',
      { token_use: 'id', client_id: 'client-id', sub: 'cognito-sub' },
    ],
    [
      'client_id',
      { token_use: 'access', client_id: 'other', sub: 'cognito-sub' },
    ],
    ['sub', { token_use: 'access', client_id: 'client-id' }],
  ])(
    '잘못된 Cognito %s claim은 요청 사용자를 만들지 않는다',
    async (_claimName, claims) => {
      const users = { findBySub: vi.fn() };
      const guard = new CognitoAuthorizerGuard(users as never, {
        authMode: 'cognito',
        cognitoClientId: 'client-id',
      });
      const request = {
        requestContext: { authorizer: { jwt: { claims } } },
      };

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toMatchObject({ status: 401 });
      expect(users.findBySub).not.toHaveBeenCalled();
      expect(request).not.toHaveProperty('user');
    },
  );

  it.each([
    ['존재하지 않는', undefined],
    [
      'DISABLED',
      {
        id: 'user-id',
        cognitoSub: 'cognito-sub',
        email: 'learner@example.com',
        role: 'LEARNER',
        status: 'DISABLED',
        mfaEnrolledAt: null,
      },
    ],
  ])('%s DB 사용자는 인증하지 않는다', async (_caseName, user) => {
    const users = { findBySub: vi.fn().mockResolvedValue(user) };
    const guard = new CognitoAuthorizerGuard(users as never, {
      authMode: 'cognito',
      cognitoClientId: 'client-id',
    });
    const request = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: 'cognito-sub',
              token_use: 'access',
              client_id: 'client-id',
            },
          },
        },
      },
    };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toMatchObject({ status: 401 });
    expect(users.findBySub).toHaveBeenCalledWith('cognito-sub');
    expect(request).not.toHaveProperty('user');
  });

  it('production에서는 fake 사용자 header를 인증에 사용하지 않는다', async () => {
    const users = { findBySub: vi.fn() };
    const guard = new CognitoAuthorizerGuard(users as never, {
      authMode: 'fake',
      cognitoClientId: 'client-id',
      nodeEnv: 'production',
    });
    const request = { headers: { 'x-dev-user-sub': 'cognito-sub' } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toMatchObject({ status: 401 });
    expect(users.findBySub).not.toHaveBeenCalled();
    expect(request).not.toHaveProperty('user');
  });

  it('claim 역할 대신 DB에서 읽은 최신 역할을 요청 사용자에 넣는다', async () => {
    const users = {
      findBySub: vi.fn().mockResolvedValue({
        id: 'user-id',
        cognitoSub: 'cognito-sub',
        email: 'learner@example.com',
        role: 'LEARNER',
        status: 'ACTIVE',
        mfaEnrolledAt: null,
      }),
    };
    const guard = new CognitoAuthorizerGuard(users as never, {
      authMode: 'cognito',
      cognitoClientId: 'client-id',
    });
    const request = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: 'cognito-sub',
              token_use: 'access',
              client_id: 'client-id',
              role: 'ADMIN',
            },
          },
        },
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        userId: 'user-id',
        sub: 'cognito-sub',
        email: 'learner@example.com',
        role: 'LEARNER',
        mfaEnrolledAt: null,
      },
    });
  });
});

describe('CsrfGuard', () => {
  it('exact Origin과 custom header가 모두 있어야 통과한다', () => {
    const guard = new CsrfGuard(['https://app.example.com']);

    expect(
      guard.canActivate(
        createContext({
          headers: {
            origin: 'https://app.example.com',
            'x-csrf-protection': '1',
          },
        }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        createContext({
          headers: {
            origin: 'https://evil.example.com',
            'x-csrf-protection': '1',
          },
        }),
      ),
    ).toThrow();
  });

  it.each([
    [
      '허용되지 않은 Origin',
      {
        origin: 'https://evil.example.com',
        'x-csrf-protection': '1',
      },
    ],
    [
      'suffix가 붙은 Origin',
      {
        origin: 'https://app.example.com.evil.example.com',
        'x-csrf-protection': '1',
      },
    ],
    [
      'prefix가 붙은 Origin',
      {
        origin: 'https://prefix.app.example.com',
        'x-csrf-protection': '1',
      },
    ],
    [
      '배열 Origin',
      {
        origin: ['https://app.example.com'],
        'x-csrf-protection': '1',
      },
    ],
    ['누락된 보호 header', { origin: 'https://app.example.com' }],
    [
      '값이 1이 아닌 보호 header',
      {
        origin: 'https://app.example.com',
        'x-csrf-protection': 'true',
      },
    ],
  ])('%s 요청을 거부한다', (_caseName, headers) => {
    const guard = new CsrfGuard(['https://app.example.com']);

    expect(() => guard.canActivate(createContext({ headers }))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });
});

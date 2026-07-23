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
});

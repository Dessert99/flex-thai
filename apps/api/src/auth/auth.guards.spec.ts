/** access token claim·DB 상태·CSRF를 서로 다른 보안 경계로 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { JobsController } from '../jobs/jobs.controller.js';
import { UploadsController } from '../uploads/uploads.controller.js';
import { CognitoAuthorizerGuard } from './cognito-authorizer.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { PhoneVerificationController } from './phone-verification.controller.js';
import { StepUpController } from './step-up.controller.js';

const GUARDS_METADATA = '__guards__';

const createContext = (request: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as never;

describe('CognitoAuthorizerGuard', () => {
  it('ID token은 client가 같아도 API access token으로 받지 않는다', async () => {
    const users = { findBySub: vi.fn() };
    const guard = new CognitoAuthorizerGuard(users as never, {
      authMode: 'cognito',
      cognitoClientId: 'client-id',
    });
    const context = createContext({
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: 'cognito-sub',
              token_use: 'id',
              client_id: 'client-id',
            },
          },
        },
      },
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(users.findBySub).not.toHaveBeenCalled();
  });

  it('검증된 sub의 ACTIVE DB 사용자를 request에 붙인다', async () => {
    const user = {
      id: 'user-id',
      cognitoSub: 'cognito-sub',
      email: 'student@school.ac.kr',
      role: 'ADMIN',
      status: 'ACTIVE',
      phoneVerifiedAt: null,
    };
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

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        userId: 'user-id',
        sub: 'cognito-sub',
        role: 'ADMIN',
      },
    });
  });

  it('serverless-express가 보관한 API Gateway claim도 읽는다', async () => {
    const user = {
      id: 'user-id',
      cognitoSub: 'cognito-sub',
      email: 'student@school.ac.kr',
      role: 'ADMIN',
      status: 'ACTIVE',
      phoneVerifiedAt: null,
    };
    const users = { findBySub: vi.fn().mockResolvedValue(user) };
    const guard = new CognitoAuthorizerGuard(users as never, {
      authMode: 'cognito',
      cognitoClientId: 'client-id',
    });

    await expect(
      guard.canActivate(
        createContext({
          apiGateway: {
            event: {
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
            },
          },
        }),
      ),
    ).resolves.toBe(true);
  });
});

describe('CsrfGuard', () => {
  it('허용한 exact Origin과 custom header가 모두 있어야 통과한다', () => {
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

describe('보호 API guard 구성', () => {
  it('사용자 정보가 필요한 Controller는 Cognito authorizer를 먼저 적용한다', () => {
    for (const controller of [
      JobsController,
      UploadsController,
      StepUpController,
      PhoneVerificationController,
    ]) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as
        unknown[] | undefined;

      expect(guards).toContain(CognitoAuthorizerGuard);
    }
  });
});

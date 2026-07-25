/** API Gateway claim과 DB 사용자 상태를 함께 검증하는 인증 guard */
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { IdentityUserRepository } from '@flex-thia/domain';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';

/** Cognito 검증 모드와 app client 경계를 guard에 전달한다 */
export interface AuthorizerGuardOptions {
  authMode: 'fake' | 'cognito';
  cognitoClientId: string;
  nodeEnv?: 'development' | 'test' | 'production';
  resolveFakeAccessTokenSubject?: (accessToken: string) => string | undefined;
}

/** Cognito guard가 사용할 사용자 repository 주입 token */
export const IDENTITY_USER_REPOSITORY = Symbol('IDENTITY_USER_REPOSITORY');

/** Cognito guard의 인증 모드와 app client 설정 주입 token */
export const AUTHORIZER_GUARD_OPTIONS = Symbol('AUTHORIZER_GUARD_OPTIONS');

type AuthRequest = {
  headers?: Record<string, string | string[] | undefined>;
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  };
  apiGateway?: {
    event?: {
      requestContext?: AuthRequest['requestContext'];
    };
  };
  user?: AuthenticatedUser;
};

/** access token의 sub를 최신 ACTIVE DB 사용자와 연결한다 */
@Injectable()
export class CognitoAuthorizerGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_USER_REPOSITORY)
    private readonly users: IdentityUserRepository,
    @Inject(AUTHORIZER_GUARD_OPTIONS)
    private readonly options: AuthorizerGuardOptions,
  ) {}

  /** access token과 DB 상태가 모두 유효할 때 request.user를 만든다 */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const subject =
      this.options.authMode === 'fake'
        ? this.readFakeSubject(request)
        : this.readCognitoSubject(request);
    const user = await this.users.findBySub(subject);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    request.user = {
      userId: user.id,
      sub: user.cognitoSub,
      email: user.email,
      role: user.role,
      mfaEnrolledAt: user.mfaEnrolledAt,
    };
    return true;
  }

  private readCognitoSubject(request: AuthRequest): string {
    const claims = (
      request.requestContext ?? request.apiGateway?.event?.requestContext
    )?.authorizer?.jwt?.claims;

    if (
      claims?.token_use !== 'access' ||
      claims.client_id !== this.options.cognitoClientId ||
      typeof claims.sub !== 'string'
    ) {
      throw new UnauthorizedException();
    }

    return claims.sub;
  }

  private readFakeSubject(request: AuthRequest): string {
    if (this.options.nodeEnv === 'production') {
      throw new UnauthorizedException();
    }

    const authorization = request.headers?.authorization;
    const bearerPrefix = 'Bearer ';
    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith(bearerPrefix) ||
      authorization.length === bearerPrefix.length
    ) {
      throw new UnauthorizedException();
    }

    const subject = this.options.resolveFakeAccessTokenSubject?.(
      authorization.slice(bearerPrefix.length),
    );
    if (!subject) {
      throw new UnauthorizedException();
    }

    return subject;
  }
}

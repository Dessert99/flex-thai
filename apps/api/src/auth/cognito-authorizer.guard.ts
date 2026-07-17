/** API Gateway claim과 DB 사용자 상태를 함께 검증하는 인증 guard */
import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserRepository } from '@flex-thia/domain';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';

/** Cognito 검증 모드와 app client 경계를 guard에 전달한다 */
export interface AuthorizerGuardOptions {
  authMode: 'fake' | 'cognito';
  cognitoClientId: string;
  nodeEnv?: 'development' | 'test' | 'production';
}

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

/** access token의 sub를 ACTIVE DB 사용자와 연결한다 */
@Injectable()
export class CognitoAuthorizerGuard implements CanActivate {
  constructor(
    private readonly users: UserRepository,
    private readonly options: AuthorizerGuardOptions,
  ) {}

  /** ID token·다른 app client·비활성 사용자는 request.user를 만들지 않는다 */
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
      role: user.role,
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

    const value = request.headers?.['x-dev-user-sub'];

    if (typeof value !== 'string' || !value) {
      throw new UnauthorizedException();
    }

    return value;
  }
}

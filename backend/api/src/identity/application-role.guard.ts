/** JWT가 아닌 최신 DB role과 역할 포함 규칙으로 권한을 판정한다 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';
import { REQUIRED_ROLE_KEY } from './require-role.decorator.js';

const ROLE_LEVEL = { LEARNER: 1, ADMIN: 2 } as const;

/** @RequireRole metadata와 request.user의 DB role을 비교한다 */
@Injectable()
export class ApplicationRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /** 상위 역할이 하위 역할의 권한을 포함할 때만 요청을 통과시킨다 */
  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.getAllAndOverride<
      AuthenticatedUser['role'] | undefined
    >(REQUIRED_ROLE_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRole) {
      return true;
    }

    const currentRole = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user?.role;

    if (!currentRole || ROLE_LEVEL[currentRole] < ROLE_LEVEL[requiredRole]) {
      throw new ForbiddenException();
    }

    return true;
  }
}

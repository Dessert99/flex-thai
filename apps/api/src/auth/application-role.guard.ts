/** JWT가 아닌 최신 DB role로 route 권한을 판정한다 */
import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';
import { REQUIRED_ROLE_KEY } from './require-role.decorator.js';

/** @RequireRole metadata와 request.user의 DB role을 비교한다 */
@Injectable()
export class ApplicationRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /** 요구 role이 없거나 현재 DB role과 일치할 때만 통과한다 */
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      AuthenticatedUser['role'] | undefined
    >(REQUIRED_ROLE_KEY, [context.getHandler(), context.getClass()]);

    if (!required) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (request.user?.role !== required) {
      throw new ForbiddenException();
    }

    return true;
  }
}

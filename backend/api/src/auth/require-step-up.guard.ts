/** raw step-up token을 사용자·action·10분 grant HMAC과 비교한다 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ChallengeCryptoPort, StepUpRepository } from '@flex-thia/domain';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';
import {
  REQUIRED_STEP_UP_KEY,
  type StepUpActionCategory,
} from './require-step-up.decorator.js';

/** 민감 route의 현재 사용자와 action에 맞는 HMAC grant만 허용한다 */
@Injectable()
export class RequireStepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly grants: StepUpRepository,
    private readonly crypto: ChallengeCryptoPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** raw token은 저장하지 않고 조회한 후보 HMAC과 timing-safe 비교한다 */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<
      StepUpActionCategory | undefined
    >(REQUIRED_STEP_UP_KEY, [context.getHandler(), context.getClass()]);

    if (!action) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const rawToken = request.headers?.['x-step-up-token'];

    if (!request.user || typeof rawToken !== 'string') {
      throw new ForbiddenException();
    }

    const now = this.now();
    const candidates = await this.grants.findActiveGrants(
      request.user.userId,
      action,
      now,
    );
    const matched = candidates.some(
      (grant) =>
        grant.actionCategory === action &&
        grant.expiresAt.getTime() > now.getTime() &&
        this.crypto.verifyAnswer(rawToken, grant.tokenHmac),
    );

    if (!matched) {
      throw new ForbiddenException();
    }

    return true;
  }
}

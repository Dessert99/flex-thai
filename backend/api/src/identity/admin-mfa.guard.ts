/** 관리자 기능을 TOTP 등록이 끝난 계정으로 제한한다 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';

/** ADMIN 사용자의 TOTP 등록 상태를 확인하는 guard */
@Injectable()
export class AdminMfaGuard implements CanActivate {
  /** MFA 미등록 관리자의 보호 route 접근을 거부한다 */
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;

    if (user?.role === 'ADMIN' && user.mfaEnrolledAt === null) {
      throw new ForbiddenException({ code: 'MFA_ENROLLMENT_REQUIRED' });
    }

    return true;
  }
}

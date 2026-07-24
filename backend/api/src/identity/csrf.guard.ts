/** cookie 인증 endpoint를 cross-site POST로부터 보호한다 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

/** CSRF guard의 exact origin allowlist 주입 token */
export const CSRF_ALLOWED_ORIGINS = Symbol('CSRF_ALLOWED_ORIGINS');

/** exact Origin과 명시적 custom header를 함께 요구하는 CSRF guard */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(CSRF_ALLOWED_ORIGINS)
    private readonly allowedOrigins: string[],
  ) {}

  /** 허용 origin이 custom header를 포함한 요청만 통과시킨다 */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const origin = request.headers?.origin;
    const csrfHeader = request.headers?.['x-csrf-protection'];

    if (
      typeof origin !== 'string' ||
      !this.allowedOrigins.includes(origin) ||
      csrfHeader !== '1'
    ) {
      throw new ForbiddenException();
    }

    return true;
  }
}

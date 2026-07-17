/** refresh cookie endpoint를 cross-site POST로부터 보호한다 */
import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/** exact Origin과 명시적 custom header를 함께 요구하는 CSRF guard */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly allowedOrigins: string[]) {}

  /** 브라우저가 custom header를 포함한 허용 origin 요청만 통과시킨다 */
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

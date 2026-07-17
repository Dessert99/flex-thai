/** 인증 guard가 request에 넣은 애플리케이션 사용자를 Controller에 전달한다 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** API use case가 신뢰하는 최소 사용자 정보 */
export interface AuthenticatedUser {
  userId: string;
  sub: string;
  role: 'LEARNER' | 'ADMIN';
}

/** HTTP request에서 검증이 끝난 사용자를 꺼낸다 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);

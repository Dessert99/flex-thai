/** 관리자 command와 오류 응답이 공유할 요청 ID를 한 번만 결정한다 */
import { randomUUID } from 'node:crypto';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** 관리자 요청 객체에 보존하는 최소 request id 문맥 */
export interface AdminRequestIdRequest {
  adminRequestId?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** 저장값, trim한 header, 생성 UUID 순서로 request id를 결정하고 보존한다 */
export const resolveAdminRequestId = (
  request: AdminRequestIdRequest,
): string => {
  if (
    typeof request.adminRequestId === 'string' &&
    request.adminRequestId.length > 0
  ) {
    return request.adminRequestId;
  }

  const header = request.headers?.['x-request-id'];
  const requestId =
    typeof header === 'string' && header.trim() ? header.trim() : randomUUID();
  request.adminRequestId = requestId;
  return requestId;
};

/** 관리자 command handler에 요청 객체와 공유된 request id를 주입한다 */
export const AdminRequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    resolveAdminRequestId(
      context.switchToHttp().getRequest<AdminRequestIdRequest>(),
    ),
);

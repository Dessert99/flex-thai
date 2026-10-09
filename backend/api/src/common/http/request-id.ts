/** 오류 응답에 사용할 요청 ID를 결정한다 */
import { randomUUID } from 'node:crypto';

export interface RequestIdRequest {
  requestId?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export const resolveRequestId = (request: RequestIdRequest): string => {
  if (request.requestId) return request.requestId;
  const header = request.headers?.['x-request-id'];
  const requestId =
    typeof header === 'string' && header.trim() ? header.trim() : randomUUID();
  request.requestId = requestId;
  return requestId;
};

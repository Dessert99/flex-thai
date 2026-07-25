/** API 실패를 UI 동작 없이 안전한 공개 detail로 정규화한다 */
import type { ProblemDetailsResponse } from '@flex-thia/contracts';

/** transport와 서버가 공개할 수 있는 API 오류 구분 */
export type ApiErrorDetail =
  | { kind: 'problem'; problem: ProblemDetailsResponse }
  | { kind: 'network' }
  | { kind: 'timeout' }
  | { kind: 'invalid-response' }
  | { kind: 'cancelled' };

const errorMessages: Record<ApiErrorDetail['kind'], string> = {
  cancelled: 'API 요청이 취소되었습니다.',
  'invalid-response': 'API 응답 계약이 올바르지 않습니다.',
  network: 'API에 연결할 수 없습니다.',
  problem: 'API 요청이 실패했습니다.',
  timeout: 'API 요청 시간이 초과되었습니다.',
};

/** UI와 독립적으로 처리 가능한 정규화 API 오류 */
export class ApiError extends Error {
  readonly detail: ApiErrorDetail;

  constructor(detail: ApiErrorDetail) {
    super(errorMessages[detail.kind]);
    this.name = 'ApiError';
    this.detail = detail;
  }
}

/** module realm이 달라도 정규화된 ApiError 브랜드를 판별한다 */
export function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError ||
    (error instanceof Error && error.name === 'ApiError' && 'detail' in error)
  );
}

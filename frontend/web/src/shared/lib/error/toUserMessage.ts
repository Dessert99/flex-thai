/** transport·예상 밖 오류를 서버 내부 정보 없는 사용자 문구로 제한한다 */
import { isApiError } from '../../api';

/** 공통 오류 화면이 표시할 수 있는 안전한 정보 */
export interface UserMessage {
  message: string;
  requestId?: string;
}

/** 도메인별 문구가 없는 오류만 공통 복구 문구로 변환한다 */
export function toUserMessage(error: unknown): UserMessage | null {
  if (!isApiError(error)) {
    return {
      message: '예상하지 못한 문제가 발생했습니다. 다시 시도해 주세요.',
    };
  }

  if (error.detail.kind === 'cancelled') {
    return null;
  }
  if (error.detail.kind === 'problem') {
    return {
      message: '요청을 처리하지 못했습니다. 다시 시도해 주세요.',
      requestId: error.detail.problem.requestId,
    };
  }
  if (error.detail.kind === 'network') {
    return {
      message: '서비스에 연결할 수 없습니다. 연결을 확인해 주세요.',
    };
  }
  if (error.detail.kind === 'timeout') {
    return {
      message: '요청 시간이 초과되었습니다. 다시 시도해 주세요.',
    };
  }

  return {
    message: '응답을 확인하지 못했습니다. 다시 시도해 주세요.',
  };
}

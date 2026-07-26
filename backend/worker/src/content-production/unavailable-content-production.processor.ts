/** 운영 AI provider 미구성 상태를 거짓 성공 없이 항목 실패로 바꾼다 */
import type {
  ContentProductionItemOutcome,
  ContentProductionItemProcessor,
} from './content-production-dispatcher.js';

/** 실제 생성 provider가 연결되기 전 모든 운영 항목을 명시적으로 실패시킨다 */
export class UnavailableContentProductionProcessor implements ContentProductionItemProcessor {
  /** 게시 가능한 결과를 만들 수 없으므로 재시도 불가 실패를 반환한다 */
  process(): Promise<ContentProductionItemOutcome> {
    return Promise.resolve({
      status: 'FAILED',
      retryable: false,
      errorCode: 'CONTENT_PRODUCTION_PROVIDER_UNAVAILABLE',
    });
  }
}

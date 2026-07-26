/** 실제 AI 없이 항목 결과와 부분 실패를 결정적으로 재현한다 */
import type { ContentProductionItem } from '@flex-thia/domain';

/** local fake processor의 항목 처리 결과 */
export interface DeterministicContentProductionOutcome {
  status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
  retryable: boolean;
  errorCode: string | null;
  result?: Record<string, unknown>;
}

/** sourceRef suffix로 비용 없는 성공·검토·실패 fixture를 생성한다 */
export class DeterministicContentProductionProcessor {
  /** 같은 sourceRef에는 언제나 같은 항목 결과를 반환한다 */
  process(
    item: ContentProductionItem,
  ): Promise<DeterministicContentProductionOutcome> {
    if (
      item.sourceRef.endsWith(':fail') ||
      /^input:2(?::|$)/u.test(item.sourceRef)
    ) {
      return Promise.resolve({
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_FAKE_FAILURE',
      });
    }

    if (
      item.sourceRef.endsWith(':attention') ||
      /^input:1(?::|$)/u.test(item.sourceRef)
    ) {
      return Promise.resolve({
        status: 'NEEDS_ATTENTION',
        retryable: false,
        errorCode: null,
        result: { reviewReason: 'LOCAL_FAKE_ATTENTION' },
      });
    }

    return Promise.resolve({
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
      result: { generated: true },
    });
  }
}

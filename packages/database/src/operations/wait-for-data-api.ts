/** Aurora Data API의 일시적인 재개 상태만 제한적으로 기다린다 */
import { DatabaseResumingException } from '@aws-sdk/client-rds-data';

/** Data API 준비 확인에 필요한 실행 동작을 주입해 재시도 정책을 격리한다 */
export interface WaitForDataApiOptions {
  maxAttempts: number;
  probe: () => Promise<void>;
  sleep: () => Promise<void>;
  onRetry: (attempt: number) => void;
}

/** 재개 중이면 기다리고 그 밖의 오류는 즉시 반환한다 */
export const waitForDataApi = async ({
  maxAttempts,
  probe,
  sleep,
  onRetry,
}: WaitForDataApiOptions): Promise<void> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await probe();
      return;
    } catch (error) {
      if (
        !(error instanceof DatabaseResumingException) ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      onRetry(attempt);
      await sleep();
    }
  }
};

/** AWS 없이 queue 전송과 일시 실패 재시도를 검증하는 in-memory adapter */
import type { ContentProductionQueue, JobQueue } from '@flex-thia/domain';

/** 전송 message를 기록하고 지정 횟수만큼 실패하는 fake queue */
export class FakeJobQueue implements JobQueue, ContentProductionQueue {
  readonly messages: Array<{ jobId: string; attempt: number }> = [];

  constructor(private failuresRemaining = 0) {}

  /** 실패가 남아 있으면 예외를 내고 성공한 message만 기록한다 */
  send(message: { jobId: string; attempt: number }): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Promise.reject(new Error('queue unavailable'));
    }

    this.messages.push({ ...message });
    return Promise.resolve();
  }
}

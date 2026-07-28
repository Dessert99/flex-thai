/** 공유 outbox claim을 transport별 sender로 넘기고 queue 수락 뒤 lease를 완료한다 */

/** relay가 DB 기술을 몰라도 lease lifecycle을 조정하는 저장 port */
export interface AsyncDispatchRelayRepository {
  claimBatch(input: {
    workerId: string;
    batchSize: number;
    leaseDurationMs: number;
  }): Promise<ClaimedAsyncDispatch[]>;
  acknowledge(input: {
    id: string;
    leaseOwner: string;
    deliveredAt: Date;
  }): Promise<boolean>;
  release(input: {
    id: string;
    leaseOwner: string;
    failedAt: Date;
    nextAvailableAt: Date;
    errorCode: string;
  }): Promise<boolean>;
}

/** queue retry에도 변하지 않는 실행 payload */
export interface AsyncDispatchMessage {
  messageId: string;
  payload: { jobId: string; attempt: number };
}

/** queue 구현이 acceptance 의미만 relay에 노출하는 transport port */
export interface AsyncDispatchSender {
  send(message: AsyncDispatchMessage): Promise<void>;
}

/** DB claim이 queue delivery identity와 현재 lease 소유권을 함께 운반한다 */
export interface ClaimedAsyncDispatch {
  id: string;
  payloadKind: 'CONTENT_PRODUCTION' | 'TTS';
  jobId: string;
  attempt: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  leaseOwner: string;
  leaseExpiresAt: Date;
  deliveryAttempts: number;
}

/** 한 번의 drain이 claim row를 어떻게 종료했는지 집계한다 */
export interface AsyncDispatchRelayResult {
  claimed: number;
  delivered: number;
  released: number;
  stale: number;
}

const isExactPayload = (
  payload: Record<string, unknown>,
  row: ClaimedAsyncDispatch,
): payload is { jobId: string; attempt: number } => {
  const keys = Object.keys(payload).sort();
  return (
    keys.length === 2 &&
    keys[0] === 'attempt' &&
    keys[1] === 'jobId' &&
    payload['jobId'] === row.jobId &&
    payload['attempt'] === row.attempt &&
    Number.isSafeInteger(payload['attempt']) &&
    row.attempt >= 0
  );
};

/** claim commit 이후 transport side effect와 ack/release만 수행한다 */
export class AsyncDispatchOutboxRelay {
  constructor(
    private readonly repository: AsyncDispatchRelayRepository,
    private readonly senders: Record<
      ClaimedAsyncDispatch['payloadKind'],
      AsyncDispatchSender
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 한 batch를 at-least-once 전송하고 stale lease 결과를 성공으로 세지 않는다 */
  async drainOnce(input: {
    workerId: string;
    batchSize?: number;
    leaseDurationMs?: number;
    retryDelayMs?: number;
  }): Promise<AsyncDispatchRelayResult> {
    const claimed = await this.repository.claimBatch({
      workerId: input.workerId,
      batchSize: input.batchSize ?? 20,
      leaseDurationMs: input.leaseDurationMs ?? 60_000,
    });
    const result: AsyncDispatchRelayResult = {
      claimed: claimed.length,
      delivered: 0,
      released: 0,
      stale: 0,
    };

    for (const row of claimed) {
      const failedAt = this.now();
      if (!isExactPayload(row.payload, row)) {
        const released = await this.repository.release({
          id: row.id,
          leaseOwner: row.leaseOwner,
          failedAt,
          nextAvailableAt: new Date(
            failedAt.getTime() + (input.retryDelayMs ?? 30_000),
          ),
          errorCode: 'ASYNC_DISPATCH_PAYLOAD_INVALID',
        });
        if (released) result.released += 1;
        else result.stale += 1;
        continue;
      }

      try {
        await this.senders[row.payloadKind].send({
          messageId: row.idempotencyKey,
          payload: { jobId: row.payload.jobId, attempt: row.payload.attempt },
        });
      } catch {
        const released = await this.repository.release({
          id: row.id,
          leaseOwner: row.leaseOwner,
          failedAt,
          nextAvailableAt: new Date(
            failedAt.getTime() + (input.retryDelayMs ?? 30_000),
          ),
          errorCode: 'ASYNC_DISPATCH_SEND_FAILED',
        });
        if (released) result.released += 1;
        else result.stale += 1;
        continue;
      }

      const acknowledged = await this.repository.acknowledge({
        id: row.id,
        leaseOwner: row.leaseOwner,
        deliveredAt: this.now(),
      });
      if (acknowledged) result.delivered += 1;
      else result.stale += 1;
    }
    return result;
  }
}

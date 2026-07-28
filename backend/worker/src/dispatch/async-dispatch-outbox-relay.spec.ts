/** 공유 dispatch relay가 queue 수락 이후에만 ack하고 실패를 redelivery로 돌리는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AsyncDispatchOutboxRelay,
  type ClaimedAsyncDispatch,
} from './async-dispatch-outbox-relay.js';

const now = new Date('2026-07-28T00:00:00.000Z');
const commandFingerprint = 'a'.repeat(64);
const row: ClaimedAsyncDispatch = {
  id: '00000000-0000-4000-8000-000000000001',
  payloadKind: 'CONTENT_PRODUCTION',
  jobId: '00000000-0000-4000-8000-000000000002',
  attempt: 2,
  idempotencyKey: 'content-production:00000000-0000-4000-8000-000000000002:2',
  payload: {
    jobId: '00000000-0000-4000-8000-000000000002',
    attempt: 2,
  },
  leaseOwner: 'worker-a:lease-1',
  leaseExpiresAt: new Date('2026-07-28T00:01:00.000Z'),
  deliveryAttempts: 1,
};

describe('공유 dispatch outbox relay', () => {
  it('claim commit 뒤 결정적 message ID로 전송하고 queue 수락 뒤 ack한다', async () => {
    const events: string[] = [];
    const repository = {
      claimBatch: vi.fn(() => {
        events.push('claim');
        return Promise.resolve([row]);
      }),
      acknowledge: vi.fn(() => {
        events.push('ack');
        return Promise.resolve(true);
      }),
      release: vi.fn(),
    };
    const contentProductionSender = {
      send: vi.fn(() => {
        events.push('send');
        return Promise.resolve();
      }),
    };
    const relay = new AsyncDispatchOutboxRelay(
      repository,
      {
        CONTENT_PRODUCTION: contentProductionSender,
        TTS: { send: vi.fn() },
      },
      () => now,
    );

    await expect(relay.drainOnce({ workerId: 'worker-a' })).resolves.toEqual({
      claimed: 1,
      delivered: 1,
      released: 0,
      stale: 0,
    });
    expect(events).toEqual(['claim', 'send', 'ack']);
    expect(contentProductionSender.send).toHaveBeenCalledWith({
      messageId: row.idempotencyKey,
      payload: { jobId: row.jobId, attempt: row.attempt },
    });
  });

  it('전송 실패는 ack하지 않고 제한된 stable code로 다음 가용 시각에 release한다', async () => {
    const repository = {
      claimBatch: vi.fn().mockResolvedValue([row]),
      acknowledge: vi.fn(),
      release: vi.fn().mockResolvedValue(true),
    };
    const relay = new AsyncDispatchOutboxRelay(
      repository,
      {
        CONTENT_PRODUCTION: {
          send: vi.fn().mockRejectedValue(new Error('token=secret')),
        },
        TTS: { send: vi.fn() },
      },
      () => now,
    );

    await expect(
      relay.drainOnce({ workerId: 'worker-a', retryDelayMs: 30_000 }),
    ).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      released: 1,
      stale: 0,
    });
    expect(repository.acknowledge).not.toHaveBeenCalled();
    expect(repository.release).toHaveBeenCalledWith({
      id: row.id,
      leaseOwner: row.leaseOwner,
      failedAt: now,
      nextAvailableAt: new Date('2026-07-28T00:00:30.000Z'),
      errorCode: 'ASYNC_DISPATCH_SEND_FAILED',
    });
  });

  it('오래 걸린 전송 실패는 시작 시각이 아니라 실제 실패 시각으로 release한다', async () => {
    const failedAt = new Date('2026-07-28T00:02:00.000Z');
    let clock = now;
    const repository = {
      claimBatch: vi.fn().mockResolvedValue([row]),
      acknowledge: vi.fn(),
      release: vi.fn().mockResolvedValue(false),
    };
    const relay = new AsyncDispatchOutboxRelay(
      repository,
      {
        CONTENT_PRODUCTION: {
          send: vi.fn(() => {
            clock = failedAt;
            return Promise.reject(new Error('late failure'));
          }),
        },
        TTS: { send: vi.fn() },
      },
      () => clock,
    );

    await relay.drainOnce({
      workerId: 'worker-a',
      retryDelayMs: 30_000,
    });

    expect(repository.release).toHaveBeenCalledWith(
      expect.objectContaining({
        failedAt,
        nextAvailableAt: new Date('2026-07-28T00:02:30.000Z'),
      }),
    );
  });

  it.each([
    ['최초', 0, 'b'.repeat(64)],
    ['재시도', 3, commandFingerprint],
  ])(
    '%s TTS row는 fingerprint를 검증한 뒤 TTS sender로만 보낸다',
    async (_, attempt, fingerprint) => {
      const ttsRow: ClaimedAsyncDispatch = {
        ...row,
        payloadKind: 'TTS',
        attempt,
        idempotencyKey: `tts:${row.jobId}:${attempt}`,
        payload: {
          jobId: row.jobId,
          attempt,
          commandFingerprint: fingerprint,
        },
      };
      const repository = {
        claimBatch: vi.fn().mockResolvedValue([ttsRow]),
        acknowledge: vi.fn().mockResolvedValue(true),
        release: vi.fn(),
      };
      const contentProductionSend = vi.fn();
      const ttsSend = vi.fn().mockResolvedValue(undefined);
      const relay = new AsyncDispatchOutboxRelay(
        repository,
        {
          CONTENT_PRODUCTION: { send: contentProductionSend },
          TTS: { send: ttsSend },
        },
        () => now,
      );

      await relay.drainOnce({ workerId: 'worker-a' });

      expect(contentProductionSend).not.toHaveBeenCalled();
      expect(ttsSend).toHaveBeenCalledWith({
        messageId: ttsRow.idempotencyKey,
        payload: { jobId: ttsRow.jobId, attempt },
      });
    },
  );

  it.each([
    ['fingerprint 누락', { jobId: row.jobId, attempt: 0 }],
    [
      'fingerprint 형식 오류',
      { jobId: row.jobId, attempt: 0, commandFingerprint: 'not-a-sha256' },
    ],
    [
      '추가 필드 포함',
      {
        jobId: row.jobId,
        attempt: 0,
        commandFingerprint,
        unexpected: true,
      },
    ],
  ])(
    'TTS %s payload는 queue로 보내지 않고 malformed로 release한다',
    async (_, payload) => {
      const malformed: ClaimedAsyncDispatch = {
        ...row,
        payloadKind: 'TTS',
        attempt: 0,
        idempotencyKey: `tts:${row.jobId}:0`,
        payload,
      };
      const repository = {
        claimBatch: vi.fn().mockResolvedValue([malformed]),
        acknowledge: vi.fn(),
        release: vi.fn().mockResolvedValue(true),
      };
      const send = vi.fn();
      const relay = new AsyncDispatchOutboxRelay(
        repository,
        {
          CONTENT_PRODUCTION: { send: vi.fn() },
          TTS: { send },
        },
        () => now,
      );

      await relay.drainOnce({ workerId: 'worker-a' });

      expect(send).not.toHaveBeenCalled();
      expect(repository.release).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'ASYNC_DISPATCH_PAYLOAD_INVALID',
        }),
      );
    },
  );

  it('TTS payload identity와 outbox row identity가 다르면 malformed로 release한다', async () => {
    const malformed: ClaimedAsyncDispatch = {
      ...row,
      payloadKind: 'TTS',
      attempt: 0,
      idempotencyKey: `tts:${row.jobId}:1`,
      payload: {
        jobId: row.jobId,
        attempt: 0,
        commandFingerprint,
      },
    };
    const repository = {
      claimBatch: vi.fn().mockResolvedValue([malformed]),
      acknowledge: vi.fn(),
      release: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn();
    const relay = new AsyncDispatchOutboxRelay(
      repository,
      {
        CONTENT_PRODUCTION: { send: vi.fn() },
        TTS: { send },
      },
      () => now,
    );

    await relay.drainOnce({ workerId: 'worker-a' });

    expect(send).not.toHaveBeenCalled();
    expect(repository.release).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'ASYNC_DISPATCH_PAYLOAD_INVALID',
      }),
    );
  });

  it('저장 payload가 실행 identity와 다르면 queue로 보내지 않고 malformed로 release한다', async () => {
    const malformed = {
      ...row,
      payload: { jobId: row.jobId, attempt: row.attempt + 1 },
    };
    const repository = {
      claimBatch: vi.fn().mockResolvedValue([malformed]),
      acknowledge: vi.fn(),
      release: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn();
    const relay = new AsyncDispatchOutboxRelay(
      repository,
      {
        CONTENT_PRODUCTION: { send },
        TTS: { send: vi.fn() },
      },
      () => now,
    );

    await relay.drainOnce({ workerId: 'worker-a' });

    expect(send).not.toHaveBeenCalled();
    expect(repository.release).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'ASYNC_DISPATCH_PAYLOAD_INVALID',
      }),
    );
  });

  it('queue 수락 중 lease가 재claim되면 stale ack를 성공으로 세지 않는다', async () => {
    const repository = {
      claimBatch: vi.fn().mockResolvedValue([row]),
      acknowledge: vi.fn().mockResolvedValue(false),
      release: vi.fn(),
    };
    const relay = new AsyncDispatchOutboxRelay(
      repository,
      {
        CONTENT_PRODUCTION: { send: vi.fn().mockResolvedValue(undefined) },
        TTS: { send: vi.fn() },
      },
      () => now,
    );

    await expect(relay.drainOnce({ workerId: 'worker-a' })).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      released: 0,
      stale: 1,
    });
  });
});

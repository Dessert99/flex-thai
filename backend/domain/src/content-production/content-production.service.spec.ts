/** 콘텐츠 제작 생성·멱등·재시도 불변 조건을 실제 in-memory port로 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  ContentProductionDomainError,
  ContentProductionService,
  type ContentProductionJob,
  type ContentProductionRepository,
} from './content-production.service.js';

const ownerId = '8f47b4d5-97d6-4596-af72-16456be51be8';
const requestId = 'dbb22737-6f3d-4112-bb0e-8e4f005c810b';
const preset = {
  id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
  name: '기본 문제 생성',
  purpose: 'QUESTION_GENERATION' as const,
  version: 1,
  parameters: { language: 'th' },
};

const createRepository = (): ContentProductionRepository & {
  stored: ContentProductionJob | null;
} => ({
  stored: null,
  createOrFind(command) {
    if (this.stored) {
      return Promise.resolve({ job: this.stored, created: false });
    }
    this.stored = {
      id: 'a9979e5d-515d-43ab-a380-e88b78513c38',
      ...command,
      inputs: command.inputs.map((input) => ({ ...input })),
      status: 'QUEUED',
      attempt: 0,
      enqueuedAt: null,
      completedAt: null,
      counts: { total: 0, succeeded: 0, needsAttention: 0, failed: 0 },
      items: [],
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
    };
    return Promise.resolve({ job: this.stored, created: true });
  },
  markEnqueued(_jobId, _attempt, enqueuedAt) {
    if (!this.stored) throw new Error('fixture job이 없습니다');
    this.stored = { ...this.stored, enqueuedAt };
    return Promise.resolve(this.stored);
  },
  findOwnedById() {
    return Promise.resolve(this.stored);
  },
  listOwned() {
    return Promise.resolve(this.stored ? [this.stored] : []);
  },
  startAttempt() {
    return Promise.resolve(null);
  },
  ensureItems() {
    return Promise.resolve();
  },
  listAttemptItems() {
    return Promise.resolve([]);
  },
  startItem() {
    return Promise.resolve(null);
  },
  renewItemLease() {
    return Promise.resolve(false);
  },
  finishItem() {
    return Promise.resolve(false);
  },
  finalizeAttempt() {
    return Promise.resolve(null);
  },
  retryFailed() {
    if (!this.stored) return Promise.resolve(null);
    if (this.stored.attempt >= 3) {
      throw new ContentProductionDomainError('JOB_RETRY_LIMIT_EXCEEDED');
    }
    this.stored = {
      ...this.stored,
      attempt: this.stored.attempt + 1,
      status: 'QUEUED',
      enqueuedAt: null,
      completedAt: null,
    };
    return Promise.resolve(this.stored);
  },
});

const command = {
  requestedBy: ownerId,
  clientRequestId: requestId,
  purpose: 'QUESTION_GENERATION' as const,
  presetSnapshot: preset,
  inputs: [
    {
      uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
      inputType: 'PDF' as const,
      inputKey: 'inputs/a.pdf',
      sizeBytes: 1024,
    },
  ],
};

describe('ContentProductionService 콘텐츠 제작 규칙', () => {
  it('서로 다른 입력 타입을 한 작업에 섞지 않는다', async () => {
    const service = new ContentProductionService(
      createRepository(),
      { send: () => Promise.resolve() },
      () => new Date('2026-07-27T00:00:01.000Z'),
    );

    await expect(
      service.create({
        ...command,
        inputs: [
          command.inputs[0]!,
          {
            uploadId: '5d024629-f887-4fae-ad46-20dc24d6de7d',
            inputType: 'TEXT',
            inputKey: 'inputs/b.txt',
            sizeBytes: 10,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'MIXED_INPUT_TYPES' });
  });

  it('같은 clientRequestId의 다른 canonical 요청을 충돌로 거절한다', async () => {
    const repository = createRepository();
    const service = new ContentProductionService(repository, {
      send: () => Promise.resolve(),
    });

    await service.create(command);

    await expect(
      service.create({
        ...command,
        purpose: 'VOCABULARY_EXTRACTION',
        presetSnapshot: {
          ...preset,
          purpose: 'VOCABULARY_EXTRACTION',
        },
      }),
    ).rejects.toMatchObject({
      code: 'CONTENT_PRODUCTION_IDEMPOTENCY_CONFLICT',
    });
  });

  it('동일한 canonical 요청 replay는 같은 작업을 다시 queue에 넣지 않는다', async () => {
    const repository = createRepository();
    const messages: Array<{ jobId: string; attempt: number }> = [];
    const service = new ContentProductionService(repository, {
      send(message) {
        messages.push(message);
        return Promise.resolve();
      },
    });

    const first = await service.create(command);
    const replay = await service.create({
      ...command,
      inputs: [...command.inputs],
    });

    expect(replay.id).toBe(first.id);
    expect(messages).toEqual([{ jobId: first.id, attempt: 0 }]);
  });

  it('실패 항목이 없는 작업과 3회 도달 작업은 재시도하지 않는다', async () => {
    const repository = createRepository();
    const service = new ContentProductionService(repository, {
      send: () => Promise.resolve(),
    });
    await service.create(command);

    await expect(
      service.retry(ownerId, repository.stored!.id),
    ).rejects.toMatchObject({ code: 'JOB_NOT_RETRYABLE' });

    repository.stored = {
      ...repository.stored!,
      attempt: 3,
      status: 'FAILED',
      counts: { total: 1, succeeded: 0, needsAttention: 0, failed: 1 },
      items: [
        {
          id: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
          sourceRef: 'input:0',
          status: 'FAILED',
          attempt: 3,
          retryable: true,
          errorCode: 'LOCAL_FAKE_FAILURE',
          leaseUntil: null,
          leaseToken: null,
        },
      ],
    };

    await expect(
      service.retry(ownerId, repository.stored.id),
    ).rejects.toMatchObject({ code: 'JOB_RETRY_LIMIT_EXCEEDED' });
  });

  it('retry queue 전송 실패 뒤 같은 attempt를 다시 전송한다', async () => {
    const repository = createRepository();
    let failuresRemaining = 0;
    const messages: Array<{ jobId: string; attempt: number }> = [];
    const service = new ContentProductionService(repository, {
      send(message) {
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          return Promise.reject(new Error('queue unavailable'));
        }
        messages.push(message);
        return Promise.resolve();
      },
    });
    await service.create(command);
    failuresRemaining = 1;
    repository.stored = {
      ...repository.stored!,
      status: 'FAILED',
      counts: { total: 1, succeeded: 0, needsAttention: 0, failed: 1 },
      items: [
        {
          id: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
          sourceRef: 'input:0',
          status: 'FAILED',
          attempt: 0,
          retryable: true,
          errorCode: 'LOCAL_FAKE_FAILURE',
          leaseUntil: null,
          leaseToken: null,
        },
      ],
    };

    await expect(service.retry(ownerId, repository.stored.id)).rejects.toThrow(
      'queue unavailable',
    );
    const retried = await service.retry(ownerId, repository.stored.id);
    expect(retried.attempt).toBe(1);
    expect(retried.enqueuedAt).toBeInstanceOf(Date);
    expect(messages).toEqual([
      { jobId: repository.stored.id, attempt: 0 },
      { jobId: repository.stored.id, attempt: 1 },
    ]);
  });
});

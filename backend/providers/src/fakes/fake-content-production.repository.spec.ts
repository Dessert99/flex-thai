/** local 콘텐츠 제작 저장소가 DB 조건부 전이와 재시도를 동일하게 재현하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeContentProductionRepository } from './fake-content-production.repository.js';

const command = {
  requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
  clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
  purpose: 'QUESTION_GENERATION' as const,
  presetSnapshot: {
    id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
    name: '기본 문제 생성',
    purpose: 'QUESTION_GENERATION' as const,
    version: 1,
    parameters: { language: 'th' },
  },
  inputs: [
    {
      uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
      inputType: 'TEXT' as const,
      inputKey: 'inputs/a.txt',
      sizeBytes: 10,
    },
    {
      uploadId: '5d024629-f887-4fae-ad46-20dc24d6de7d',
      inputType: 'TEXT' as const,
      inputKey: 'inputs/b.txt',
      sizeBytes: 20,
    },
  ],
};

describe('FakeContentProductionRepository 상태 전이', () => {
  it('heartbeat 중에는 탈취하지 않고 중단 뒤 만료되면 새 token으로 재claim한다', async () => {
    let currentTime = new Date('2026-07-27T00:00:00.000Z');
    const repository = new FakeContentProductionRepository(() => currentTime);
    const { job } = await repository.createOrFind(command);
    await repository.startAttempt(job.id, 0);
    await repository.ensureItems(job.id, ['input:0']);
    const [pending] = await repository.listAttemptItems(job.id, 0);
    const firstClaim = await repository.startItem(job.id, pending!.id, 0);

    expect(firstClaim?.leaseUntil).toEqual(
      new Date('2026-07-27T00:05:00.000Z'),
    );
    expect(firstClaim?.leaseToken).toEqual(expect.any(String));

    currentTime = new Date('2026-07-27T00:04:00.000Z');
    await expect(
      repository.renewItemLease(
        job.id,
        pending!.id,
        0,
        firstClaim!.leaseToken!,
      ),
    ).resolves.toBe(true);

    currentTime = new Date('2026-07-27T00:06:00.000Z');
    await expect(
      repository.startItem(job.id, pending!.id, 0),
    ).resolves.toBeNull();

    currentTime = new Date('2026-07-27T00:09:01.000Z');
    const [expired] = await repository.listAttemptItems(job.id, 0);
    const secondClaim = await repository.startItem(job.id, expired!.id, 0);

    expect(secondClaim?.leaseUntil).toEqual(
      new Date('2026-07-27T00:14:01.000Z'),
    );
    expect(secondClaim?.leaseToken).not.toBe(firstClaim?.leaseToken);
    await expect(
      repository.finishItem(job.id, expired!.id, 0, firstClaim!.leaseToken!, {
        status: 'SUCCEEDED',
        retryable: false,
        errorCode: null,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.finishItem(job.id, expired!.id, 0, secondClaim!.leaseToken!, {
        status: 'SUCCEEDED',
        retryable: false,
        errorCode: null,
      }),
    ).resolves.toBe(true);
  });

  it('같은 RUNNING attempt는 재개하고 stale·terminal 재전달은 무시한다', async () => {
    const repository = new FakeContentProductionRepository();
    const { job } = await repository.createOrFind(command);

    expect(await repository.startAttempt(job.id, 1)).toBeNull();
    expect(await repository.startAttempt(job.id, 0)).toMatchObject({
      status: 'RUNNING',
    });
    expect(await repository.startAttempt(job.id, 0)).toMatchObject({
      status: 'RUNNING',
    });
    await repository.ensureItems(job.id, ['input:0']);
    const [item] = await repository.listAttemptItems(job.id, 0);
    const claimed = await repository.startItem(job.id, item!.id, 0);
    await repository.finishItem(job.id, item!.id, 0, claimed!.leaseToken!, {
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
    });
    await repository.finalizeAttempt(job.id, 0);

    expect(await repository.startAttempt(job.id, 0)).toBeNull();
  });

  it('항목 실패를 격리해 부분 실패로 집계하고 retryable 항목만 다시 연다', async () => {
    const repository = new FakeContentProductionRepository();
    const { job } = await repository.createOrFind(command);
    await repository.startAttempt(job.id, 0);
    await repository.ensureItems(job.id, ['input:0', 'input:1']);
    const [first, second] = await repository.listAttemptItems(job.id, 0);

    const firstClaim = await repository.startItem(job.id, first!.id, 0);
    await repository.finishItem(job.id, first!.id, 0, firstClaim!.leaseToken!, {
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
    });
    const secondClaim = await repository.startItem(job.id, second!.id, 0);
    await repository.finishItem(
      job.id,
      second!.id,
      0,
      secondClaim!.leaseToken!,
      {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_FAKE_FAILURE',
      },
    );

    await expect(repository.finalizeAttempt(job.id, 0)).resolves.toEqual({
      jobId: job.id,
      status: 'COMPLETED_WITH_FAILURES',
    });
    const retried = await repository.retryFailed(
      job.id,
      command.requestedBy,
      3,
    );

    expect(retried).toMatchObject({
      attempt: 1,
      status: 'QUEUED',
      counts: { total: 2, succeeded: 1, failed: 1 },
    });
    expect(retried?.items).toEqual([
      expect.objectContaining({ status: 'SUCCEEDED', attempt: 0 }),
      expect.objectContaining({ status: 'PENDING', attempt: 1 }),
    ]);
  });
});

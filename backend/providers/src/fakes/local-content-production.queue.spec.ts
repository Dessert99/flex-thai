/** 로컬 콘텐츠 제작 queue가 실제 항목 상태 전이와 재시도를 끝내는지 검증한다 */
import { ContentProductionService } from '@flex-thia/domain';
import { describe, expect, it } from 'vitest';
import { DeterministicContentProductionProcessor } from './deterministic-content-production.processor.js';
import { FakeContentProductionRepository } from './fake-content-production.repository.js';
import { LocalContentProductionQueue } from './local-content-production.queue.js';

const createCommand = () => ({
  requestedBy: '4e6c319e-29c9-4940-ab59-57e9f3a69120',
  clientRequestId: 'local-request',
  purpose: 'VOCABULARY_EXTRACTION' as const,
  presetSnapshot: {
    id: '1a2b30f6-9e2a-4cf1-996d-a9f9adcc18fb',
    name: '로컬 어휘 추출',
    purpose: 'VOCABULARY_EXTRACTION' as const,
    version: 1,
    parameters: {},
  },
  inputs: [0, 1, 2].map((index) => ({
    uploadId: `00000000-0000-4000-8000-00000000000${index}`,
    inputType: 'TEXT' as const,
    inputKey: `inputs/local/${index}`,
    sizeBytes: 10,
  })),
});

describe('LocalContentProductionQueue', () => {
  it('로컬 작업을 다음 event loop에서 부분 실패 terminal 상태까지 처리한다', async () => {
    const repository = new FakeContentProductionRepository();
    const queue = new LocalContentProductionQueue(
      repository,
      new DeterministicContentProductionProcessor(),
    );
    const service = new ContentProductionService(repository, queue);

    const queued = await service.create(createCommand());
    expect(queued.status).toBe('QUEUED');

    await queue.waitForIdle();

    await expect(
      repository.findOwnedById(queued.requestedBy, queued.id),
    ).resolves.toMatchObject({
      status: 'COMPLETED_WITH_FAILURES',
      counts: {
        total: 3,
        succeeded: 1,
        needsAttention: 1,
        failed: 1,
      },
    });
  });

  it('retryable 실패 항목을 다음 attempt에서 다시 처리한다', async () => {
    const repository = new FakeContentProductionRepository();
    const queue = new LocalContentProductionQueue(
      repository,
      new DeterministicContentProductionProcessor(),
    );
    const service = new ContentProductionService(repository, queue);
    const created = await service.create(createCommand());
    await queue.waitForIdle();

    const retried = await service.retry(created.requestedBy, created.id);
    expect(retried).toMatchObject({ status: 'QUEUED', attempt: 1 });

    await queue.waitForIdle();

    await expect(
      repository.findOwnedById(created.requestedBy, created.id),
    ).resolves.toMatchObject({
      status: 'COMPLETED_WITH_FAILURES',
      attempt: 1,
      counts: { succeeded: 1, needsAttention: 1, failed: 1 },
    });
  });
});

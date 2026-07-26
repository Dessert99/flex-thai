/** 콘텐츠 제작 Lambda 진입점이 dispatcher 규칙을 그대로 사용하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  ContentProductionItemProcessor,
  ContentProductionWorkerRepository,
} from './content-production/content-production-dispatcher.js';
import { createContentProductionTaskHandler } from './content-production-task.js';

describe('콘텐츠 제작 Lambda 진입점', () => {
  it('stale workflow 전달을 dispatcher 규칙대로 무시한다', async () => {
    const repository = {
      startAttempt: vi.fn().mockResolvedValue(null),
      ensureItems: vi.fn(),
      listAttemptItems: vi.fn(),
      startItem: vi.fn(),
      renewItemLease: vi.fn(),
      finishItem: vi.fn(),
      finalizeAttempt: vi.fn(),
    } satisfies ContentProductionWorkerRepository;
    const processor = {
      process: vi.fn(),
    } satisfies ContentProductionItemProcessor;
    const handler = createContentProductionTaskHandler(repository, processor);

    await expect(
      handler({ jobId: '00000000-0000-4000-8000-000000000001', attempt: 2 }),
    ).resolves.toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
      status: 'IGNORED',
    });
  });
});

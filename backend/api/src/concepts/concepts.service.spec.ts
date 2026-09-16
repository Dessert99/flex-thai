import { ConceptPersistenceError } from '@flex-thia/database/repositories/drizzle-concept-admin.repository';
import { describe, expect, it, vi } from 'vitest';
import { ConceptsService } from './concepts.service.js';

describe('ConceptsService', () => {
  it('없는 게시 개념을 같은 404로 숨긴다', async () => {
    const service = new ConceptsService({
      learnerQuery: {
        list: vi.fn(),
        findPublishedDetail: vi.fn().mockResolvedValue(null),
      },
      adminQuery: {} as never,
      adminService: {} as never,
    });

    await expect(
      service.getPublishedDetail('11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('개념 persistence 상태 충돌을 409로 매핑한다', async () => {
    const service = new ConceptsService({
      learnerQuery: {} as never,
      adminQuery: {} as never,
      adminService: {
        hideConcept: vi
          .fn()
          .mockRejectedValue(
            new ConceptPersistenceError('CONCEPT_INVALID_TRANSITION'),
          ),
      } as never,
    });

    await expect(
      service.hide('11111111-1111-4111-8111-111111111111', {
        actorSub: 'admin',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        requestId: 'request-1',
        occurredAt: new Date(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

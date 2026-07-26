/** 학습자 개념 controller의 공개 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { LearnerConceptsController } from './learner-concepts.controller.js';

describe('LearnerConceptsController', () => {
  it('category 계약을 parse해 목록 service에 전달한다', async () => {
    const concepts = {
      listPublished: vi.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new LearnerConceptsController(concepts as never);

    await expect(controller.list({ category: 'GRAMMAR' })).resolves.toEqual({
      items: [],
    });
    expect(concepts.listPublished).toHaveBeenCalledWith('GRAMMAR');
  });
});

/** 콘텐츠 제작 form schema가 plan 합과 목적별 option을 강제하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { contentProductionFormSchema } from './contentProductionFormSchema';

describe('콘텐츠 제작 form schema', () => {
  it('어휘 전용 구성은 빈 options만 허용한다', () => {
    expect(
      contentProductionFormSchema.safeParse({
        purpose: 'VOCABULARY_EXTRACTION',
        presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        options: { questionCount: 1 },
      }).success,
    ).toBe(false);
  });
});

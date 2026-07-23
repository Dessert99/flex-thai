/** Job 생성 요청이 파일 개수 대신 검증된 전체 용량으로 제한되게 고정한다 */
import { describe, expect, it } from 'vitest';
import { createJobRequestSchema } from './jobs.js';

describe('createJobRequestSchema', () => {
  it('입력 개수 대신 전체 용량으로 작업을 제한한다', () => {
    const result = createJobRequestSchema.safeParse({
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      type: 'VOCAB_IMPORT',
      uploadIds: Array.from(
        { length: 100 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ),
    });

    expect(result.success).toBe(true);
  });
});

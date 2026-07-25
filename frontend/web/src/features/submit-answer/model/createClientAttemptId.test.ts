/** 논리 제출마다 브라우저 UUID를 한 번만 만드는 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { createClientAttemptId } from './createClientAttemptId';

describe('clientAttemptId 생성', () => {
  it('브라우저 crypto.randomUUID 결과를 그대로 사용한다', () => {
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('01933b6a-8f13-7a19-b7e5-536d70f57aaa');

    expect(createClientAttemptId()).toBe(
      '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    );
    expect(randomUUID).toHaveBeenCalledOnce();
  });
});

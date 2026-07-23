/** 짧은 OTP도 secret pepper 없이는 검증할 수 없게 고정한다 */
import { describe, expect, it } from 'vitest';
import { ChallengeCrypto } from './challenge-crypto.js';

describe('ChallengeCrypto', () => {
  it('같은 답은 검증하지만 저장 문자열에 원문을 포함하지 않는다', () => {
    const crypto = new ChallengeCrypto('test-pepper');
    const stored = crypto.hashAnswer('123456', Buffer.alloc(16, 2));

    expect(stored).not.toContain('123456');
    expect(crypto.verifyAnswer('123456', stored)).toBe(true);
    expect(crypto.verifyAnswer('654321', stored)).toBe(false);
  });
});

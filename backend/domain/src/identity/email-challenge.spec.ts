/** 이메일 challenge 상태와 안정적인 오류 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import { EmailChallengeError } from './email-challenge.js';

describe('EmailChallengeError', () => {
  it('공개 가능한 challenge 오류 code를 보존한다', () => {
    expect(
      new EmailChallengeError('CHALLENGE_ALREADY_USED'),
    ).toMatchObject({
      name: 'EmailChallengeError',
      code: 'CHALLENGE_ALREADY_USED',
    });
  });
});

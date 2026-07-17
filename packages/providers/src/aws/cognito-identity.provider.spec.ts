/** Cognito 사용자 준비가 기본 초대 message를 보내지 않게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { CognitoIdentityProvider } from './cognito-identity.provider.js';

describe('CognitoIdentityProvider', () => {
  it('없는 사용자는 AdminCreateUser SUPPRESS로 준비한다', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ name: 'UserNotFoundException' })
      .mockResolvedValueOnce({});
    const provider = new CognitoIdentityProvider(
      { send } as never,
      'user-pool-id',
      'client-id',
    );

    await provider.ensureUser('student@school.ac.kr');

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      input: {
        UserPoolId: 'user-pool-id',
        Username: 'student@school.ac.kr',
        MessageAction: 'SUPPRESS',
      },
    });
  });
});

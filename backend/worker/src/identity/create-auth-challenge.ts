/** Cognito custom challenge의 공개·비공개 parameter를 분리한다 */
import { createHmac, randomBytes } from 'node:crypto';
import { buildCustomAuthProofMessage } from '@flex-thia/domain';

/** Create Auth Challenge handler가 사용하는 최소 Cognito event */
export interface CreateAuthChallengeEvent {
  userName: string;
  request: object;
  response: {
    publicChallengeParameters: Record<string, string>;
    privateChallengeParameters: Record<string, string>;
  };
}

type NonceFactory = () => string;

/** 공개 nonce와 server-only HMAC proof를 challenge parameter로 분리한다 */
export const createAuthChallenge = <T extends CreateAuthChallengeEvent>(
  event: T,
  customAuthSecret: string = requireCustomAuthSecret(),
  createNonce: NonceFactory = () => randomBytes(32).toString('base64url'),
): T => {
  if (Buffer.byteLength(customAuthSecret, 'utf8') < 32) {
    throw new Error('CUSTOM_AUTH_SECRET은 32 bytes 이상이어야 합니다');
  }
  const nonce = createNonce();
  const expectedHmac = createHmac('sha256', customAuthSecret)
    .update(buildCustomAuthProofMessage(event.userName, nonce))
    .digest('base64url');
  event.response.publicChallengeParameters = {
    challenge: 'EMAIL_VERIFIED',
    nonce,
  };
  event.response.privateChallengeParameters = { expectedHmac };
  return event;
};

const requireCustomAuthSecret = (): string => {
  const value = process.env.CUSTOM_AUTH_SECRET;
  if (!value) throw new Error('CUSTOM_AUTH_SECRET이 필요합니다');
  return value;
};

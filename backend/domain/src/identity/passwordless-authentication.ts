/** passwordless provider·sender·secret 생성 경계를 정의한다 */
import type { ProviderLoginResult } from './authentication.js';

/** 유효한 이메일 소유 증명 뒤 MFA email까지 포함하는 완료 결과 */
export type PasswordlessAuthenticationResult =
  | Extract<ProviderLoginResult, { kind: 'AUTHENTICATED' }>
  | {
      kind: 'MFA_REQUIRED';
      challengeToken: string;
      email: string;
    };

/** 외부 identity provider의 passwordless 완료 port */
export interface PasswordlessAuthenticationProvider {
  complete(email: string): Promise<ProviderLoginResult>;
}

/** provider와 Cognito trigger가 같은 HMAC message를 만들도록 경계를 고정한다 */
export const buildCustomAuthProofMessage = (
  username: string,
  nonce: string,
): string => `${username}\0${nonce}`;

/** 코드와 링크를 한 메일로 보내는 port */
export interface EmailChallengeSender {
  send(input: {
    email: string;
    code: string;
    linkUrl: string;
    expiresAt: Date;
  }): Promise<void>;
}

/** 원문과 persistence용 HMAC을 한 번에 만드는 port */
export interface ChallengeSecretsFactory {
  createChallengeSecrets(): {
    code: string;
    linkToken: string;
    codeHmac: string;
    linkHmac: string;
  };
}

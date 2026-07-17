/** Cognito Create trigger를 HMAC 저장과 SES 전송 port에 연결한다 */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { SesChallengeSender } from '@flex-thia/providers';
import type { CreateAuthChallengeTriggerEvent } from 'aws-lambda';
import type {
  AuthChallengeRepository,
  ChallengeCryptoPort,
  ChallengeSender,
} from '@flex-thia/domain';
import { readWorkerEnv } from '../database-runtime.js';
import { createAuthTriggerRuntime } from './runtime.js';

/** CreateAuthChallenge trigger가 요구하는 결정 가능 의존성 */
export interface CreateAuthChallengeDependencies {
  repository: AuthChallengeRepository;
  crypto: ChallengeCryptoPort;
  sender: ChallengeSender;
  generateCode: () => string;
  generateLinkToken: () => string;
  generateChallengeId: () => string;
  now?: () => Date;
}

/** code·link 원문은 이메일로만 보내고 Cognito에는 challenge id만 남긴다 */
export const createAuthChallengeHandler = (
  dependencies: CreateAuthChallengeDependencies,
) => {
  const now = dependencies.now ?? (() => new Date());

  return async (
    event: CreateAuthChallengeTriggerEvent,
  ): Promise<CreateAuthChallengeTriggerEvent> => {
    const email = event.request.userAttributes.email;

    if (!email) {
      throw new Error('Cognito 사용자 email attribute가 필요합니다');
    }

    const challengeId = dependencies.generateChallengeId();
    const code = dependencies.generateCode();
    const linkToken = dependencies.generateLinkToken();
    await dependencies.repository.create({
      id: challengeId,
      emailHash: dependencies.crypto.hashAnswer(email),
      codeHmac: dependencies.crypto.hashAnswer(code),
      linkHmac: dependencies.crypto.hashAnswer(linkToken),
      expiresAt: new Date(now().getTime() + 10 * 60 * 1000),
    });
    await dependencies.sender.send({
      email,
      challengeId,
      code,
      linkToken,
    });

    event.response.publicChallengeParameters = { challengeId };
    event.response.privateChallengeParameters = { challengeId };
    event.response.challengeMetadata = `PASSWORDLESS:${challengeId}`;
    return event;
  };
};

let defaultHandler: ReturnType<typeof createAuthChallengeHandler> | undefined;

/** AWS 환경 의존성을 지연 생성해 Cognito Create trigger를 실행한다 */
export const handler = (
  event: CreateAuthChallengeTriggerEvent,
): Promise<CreateAuthChallengeTriggerEvent> => {
  if (!defaultHandler) {
    const runtime = createAuthTriggerRuntime();
    defaultHandler = createAuthChallengeHandler({
      ...runtime,
      sender: new SesChallengeSender(
        new SESv2Client({}),
        readWorkerEnv('SES_FROM_EMAIL'),
        readWorkerEnv('APP_URL'),
      ),
      generateCode: () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
      generateLinkToken: () => randomBytes(32).toString('base64url'),
      generateChallengeId: randomUUID,
    });
  }

  return defaultHandler(event);
};

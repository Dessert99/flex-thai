/** Cognito custom challenge를 순수 조립하고 secret ARN 기반 Lambda 진입점을 제공한다 */
import { createHmac, randomBytes } from 'node:crypto';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
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
type CustomAuthSecretLoader = () => Promise<string>;

interface CustomAuthSecretsManager {
  send(
    command: GetSecretValueCommand,
  ): Promise<{ SecretString?: string | undefined }>;
}

/** 공개 nonce와 server-only HMAC proof를 challenge parameter로 분리한다 */
export const buildCreateAuthChallenge = <T extends CreateAuthChallengeEvent>(
  event: T,
  customAuthSecret: string,
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

/** ARN secret을 실행 환경당 한 번 읽는 cold-start cache loader를 만든다 */
export const createCustomAuthSecretLoader = (
  client: CustomAuthSecretsManager,
  source: Record<string, string | undefined> = process.env,
): CustomAuthSecretLoader => {
  let cachedSecret: Promise<string> | undefined;

  return () => {
    if (cachedSecret) return cachedSecret;

    const pendingSecret = (async () => {
      const secretArn = source.CUSTOM_AUTH_SECRET_ARN;
      if (!secretArn) {
        throw new Error('CUSTOM_AUTH_SECRET_ARN이 필요합니다');
      }
      const result = await client.send(
        new GetSecretValueCommand({ SecretId: secretArn }),
      );
      if (!result.SecretString) {
        throw new Error('CUSTOM_AUTH_SECRET SecretString이 필요합니다');
      }
      return result.SecretString;
    })();
    cachedSecret = pendingSecret;
    void pendingSecret.catch(() => {
      if (cachedSecret === pendingSecret) cachedSecret = undefined;
    });
    return pendingSecret;
  };
};

/** AWS Context와 secret 주입을 분리한 async Cognito Lambda handler를 만든다 */
export const createCreateAuthChallengeHandler =
  (
    loadCustomAuthSecret: CustomAuthSecretLoader,
    createNonce: NonceFactory = () => randomBytes(32).toString('base64url'),
  ) =>
  async <T extends CreateAuthChallengeEvent>(
    event: T,
    context?: unknown,
  ): Promise<T> => {
    void context;
    return buildCreateAuthChallenge(
      event,
      await loadCustomAuthSecret(),
      createNonce,
    );
  };

const secretsManager = new SecretsManagerClient({});
const loadCustomAuthSecret = createCustomAuthSecretLoader({
  send: (command) => secretsManager.send(command),
});

/** Cognito가 직접 호출하는 production Create Auth Challenge Lambda entrypoint */
export const createAuthChallenge =
  createCreateAuthChallengeHandler(loadCustomAuthSecret);

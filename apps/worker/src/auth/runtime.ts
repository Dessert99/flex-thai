/** Cognito trigger가 공유하는 challenge repository와 crypto를 지연 생성한다 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { DrizzleAuthChallengeRepository } from '@flex-thia/database';
import { ChallengeCrypto } from '@flex-thia/providers';
import { createWorkerDatabase, readWorkerEnv } from '../database-runtime.js';

/** 테스트와 AWS 구현이 공유하는 secret reader port */
export interface SecretReader {
  read(secretArn: string): Promise<string>;
}

/** Secrets Manager GetSecretValue만 호출하는 기본 reader */
export class AwsSecretReader implements SecretReader {
  constructor(private readonly client = new SecretsManagerClient({})) {}

  /** ARN 하나의 SecretString을 읽고 binary secret은 거부한다 */
  async read(secretArn: string): Promise<string> {
    const result = await this.client.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );

    if (!result.SecretString) {
      throw new Error(`SecretString을 찾을 수 없습니다: ${secretArn}`);
    }

    return result.SecretString;
  }
}

/** Cognito trigger용 repository와 보안 adapter를 secret ARN에서 만든다 */
export const createAuthTriggerRuntime = async (
  secrets: SecretReader = new AwsSecretReader(),
) => {
  const sessionKey = await secrets.read(
    readWorkerEnv('CHALLENGE_SESSION_KEY_SECRET_ARN'),
  );
  const pepper = await secrets.read(
    readWorkerEnv('CHALLENGE_HMAC_PEPPER_SECRET_ARN'),
  );

  return {
    repository: new DrizzleAuthChallengeRepository(createWorkerDatabase()),
    crypto: new ChallengeCrypto(Buffer.from(sessionKey, 'utf8'), pepper),
  };
};

/** Cognito trigger가 공유하는 challenge repository와 crypto를 지연 생성한다 */
import { DrizzleAuthChallengeRepository } from '@flex-thia/database';
import { ChallengeCrypto } from '@flex-thia/providers';
import { createWorkerDatabase, readWorkerEnv } from '../database-runtime.js';

/** Cognito trigger용 repository와 보안 adapter를 환경 변수에서 만든다 */
export const createAuthTriggerRuntime = () => ({
  repository: new DrizzleAuthChallengeRepository(createWorkerDatabase()),
  crypto: new ChallengeCrypto(
    Buffer.from(readWorkerEnv('CHALLENGE_ENCRYPTION_KEY_BASE64'), 'base64'),
    readWorkerEnv('CHALLENGE_PEPPER'),
  ),
});

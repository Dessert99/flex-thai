/** API Lambda가 입력 환경 설정을 별도 객체로 격리한다 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/** 테스트와 AWS 구현이 공유하는 API secret reader port */
export interface ApiSecretReader {
  read(secretArn: string): Promise<string>;
}

/** Secrets Manager의 SecretString만 읽는 기본 API reader */
export class AwsApiSecretReader implements ApiSecretReader {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(private readonly client = new SecretsManagerClient({})) {}

  /** ARN 하나의 secret 원문을 Lambda 메모리로 읽는다 */
  async read(secretArn: string): Promise<string> {
    const cached = this.cache.get(secretArn);
    if (cached) return cached;

    const pending = this.readUncached(secretArn);
    this.cache.set(secretArn, pending);
    try {
      return await pending;
    } catch (error) {
      this.cache.delete(secretArn);
      throw error;
    }
  }

  private async readUncached(secretArn: string): Promise<string> {
    const result = await this.client.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );
    if (!result.SecretString) {
      throw new Error(`SecretString을 찾을 수 없습니다: ${secretArn}`);
    }
    return result.SecretString;
  }
}

/** 배포 secret ARN을 API가 소비하는 직접 환경 값으로 해석한다 */
export const loadApiRuntimeSource = async (
  source: Record<string, string | undefined>,
  secrets: ApiSecretReader = new AwsApiSecretReader(),
): Promise<Record<string, string | undefined>> => {
  if (
    source.NODE_ENV === 'production' &&
    (source.CUSTOM_AUTH_SECRET || source.CHALLENGE_HMAC_PEPPER)
  ) {
    throw new Error('production 인증 secret은 ARN으로만 전달해야 합니다');
  }

  const runtimeSource = { ...source };
  const customAuthArn = runtimeSource.CUSTOM_AUTH_SECRET_ARN;
  const pepperArn = runtimeSource.CHALLENGE_HMAC_PEPPER_SECRET_ARN;

  if (customAuthArn) {
    runtimeSource.CUSTOM_AUTH_SECRET = await secrets.read(customAuthArn);
  }

  if (pepperArn) {
    runtimeSource.CHALLENGE_HMAC_PEPPER = await secrets.read(pepperArn);
  }

  return runtimeSource;
};

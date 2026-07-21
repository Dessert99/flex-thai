/** API Lambda가 인증 코드 HMAC pepper를 Secrets Manager에서 읽는다 */
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
  constructor(private readonly client = new SecretsManagerClient({})) {}

  /** ARN 하나의 secret 원문을 Lambda 메모리로 읽는다 */
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

/** pepper ARN이 있으면 원문을 process.env에 쓰지 않고 새 설정 객체에만 넣는다 */
export const loadApiRuntimeSource = async (
  source: Record<string, string | undefined>,
  secrets: ApiSecretReader = new AwsApiSecretReader(),
): Promise<Record<string, string | undefined>> => {
  const pepperArn = source.CHALLENGE_HMAC_PEPPER_SECRET_ARN;
  if (!pepperArn) return { ...source };
  return {
    ...source,
    CHALLENGE_HMAC_PEPPER: await secrets.read(pepperArn),
  };
};

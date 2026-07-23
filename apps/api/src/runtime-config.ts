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

/** legacy secret을 읽지 않고 입력 설정의 복사본을 반환한다 */
export const loadApiRuntimeSource = async (
  source: Record<string, string | undefined>,
  _secrets?: ApiSecretReader,
): Promise<Record<string, string | undefined>> => ({ ...source });

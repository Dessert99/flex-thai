/** Cognito user attribute API로 관리자 전화번호를 검증한다 */
import {
  GetUserAttributeVerificationCodeCommand,
  GetUserCommand,
  type CognitoIdentityProviderClient,
  UpdateUserAttributesCommand,
  VerifyUserAttributeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { VerifiedPhoneProvider } from '@flex-thia/domain';

/** access token 소유자의 phone_number만 등록·검증하는 Cognito adapter */
export class CognitoPhoneVerificationProvider implements VerifiedPhoneProvider {
  constructor(private readonly client: CognitoIdentityProviderClient) {}

  /** E.164 전화번호를 현재 사용자 attribute로 설정하고 verification code를 요청한다 */
  async startVerification(
    accessToken: string,
    phoneNumber: string,
  ): Promise<void> {
    await this.client.send(
      new UpdateUserAttributesCommand({
        AccessToken: accessToken,
        UserAttributes: [{ Name: 'phone_number', Value: phoneNumber }],
      }),
    );
    await this.client.send(
      new GetUserAttributeVerificationCodeCommand({
        AccessToken: accessToken,
        AttributeName: 'phone_number',
      }),
    );
  }

  /** Cognito가 보낸 code로 현재 사용자의 phone_number를 검증한다 */
  async verify(accessToken: string, code: string): Promise<void> {
    await this.client.send(
      new VerifyUserAttributeCommand({
        AccessToken: accessToken,
        AttributeName: 'phone_number',
        Code: code,
      }),
    );
  }

  /** Cognito가 verified=true로 확인한 E.164 전화번호만 반환한다 */
  async getVerifiedPhoneNumber(accessToken: string): Promise<string> {
    const result = await this.client.send(
      new GetUserCommand({ AccessToken: accessToken }),
    );
    const attributes = new Map(
      result.UserAttributes?.map((attribute) => [
        attribute.Name,
        attribute.Value,
      ]),
    );
    const phoneNumber = attributes.get('phone_number');
    const verified = attributes.get('phone_number_verified');

    if (!phoneNumber || verified !== 'true') {
      throw new Error('검증된 Cognito phone_number가 없습니다');
    }

    return phoneNumber;
  }
}

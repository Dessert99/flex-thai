/** Cognito 전화번호 등록·검증 뒤 DB 완료 시각을 갱신한다 */
import { Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import type { UserRepository, VerifiedPhoneProvider } from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { VERIFIED_PHONE_PROVIDER } from './step-up.controller.js';

/** user repository의 NestJS injection token */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

const bearer = (authorization: string): string => {
  const [scheme, token, extra] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token || extra) {
    throw new Error('Bearer access token이 필요합니다');
  }

  return token;
};

/** 현재 Cognito 사용자의 E.164 전화번호 검증 API */
@Controller('auth/phone')
export class PhoneVerificationController {
  constructor(
    @Inject(VERIFIED_PHONE_PROVIDER)
    private readonly phone: VerifiedPhoneProvider,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  /** E.164 전화번호를 Cognito에 설정하고 verification code를 요청한다 */
  @Post('challenges')
  async start(
    @Headers('authorization') authorization: string,
    @Body() body: { phoneNumber: string },
  ) {
    if (!/^\+[1-9]\d{7,14}$/u.test(body.phoneNumber)) {
      throw new Error('E.164 전화번호가 필요합니다');
    }

    await this.phone.startVerification(bearer(authorization), body.phoneNumber);
    return { challengeId: 'phone_number' };
  }

  /** Cognito code 성공 뒤에만 DB phoneVerifiedAt을 갱신한다 */
  @Post('challenges/:challengeId/verify')
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId') challengeId: string,
    @Headers('authorization') authorization: string,
    @Body() body: { code: string },
  ) {
    if (challengeId !== 'phone_number') {
      throw new Error('전화번호 challenge id가 잘못되었습니다');
    }

    const accessToken = bearer(authorization);
    await this.phone.verify(accessToken, body.code);
    await this.phone.getVerifiedPhoneNumber(accessToken);
    return this.users.markPhoneVerified(user.sub, new Date());
  }
}

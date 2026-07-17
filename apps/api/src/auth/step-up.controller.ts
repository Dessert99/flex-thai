/** verified Cognito phone으로 관리자 step-up challenge를 발급한다 */
import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { StepUpService, type VerifiedPhoneProvider } from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApplicationRoleGuard } from './application-role.guard.js';
import { RequireRole } from './require-role.decorator.js';
import type { StepUpActionCategory } from './require-step-up.decorator.js';

/** verified phone provider의 NestJS injection token */
export const VERIFIED_PHONE_PROVIDER = Symbol('VERIFIED_PHONE_PROVIDER');

const readBearerToken = (authorization: string): string => {
  const [scheme, token, extra] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token || extra) {
    throw new Error('Bearer access token이 필요합니다');
  }

  return token;
};

/** ADMIN만 사용할 수 있는 SMS 추가 인증 API */
@Controller('auth/step-up')
@UseGuards(ApplicationRoleGuard)
@RequireRole('ADMIN')
export class StepUpController {
  constructor(
    private readonly stepUp: StepUpService,
    @Inject(VERIFIED_PHONE_PROVIDER)
    private readonly phone: VerifiedPhoneProvider,
  ) {}

  /** API body가 아닌 Cognito verified phone으로 OTP를 보낸다 */
  @Post('challenges')
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('authorization') authorization: string,
    @Body() body: { actionCategory: StepUpActionCategory },
  ) {
    const phoneNumber = await this.phone.getVerifiedPhoneNumber(
      readBearerToken(authorization),
    );
    return this.stepUp.request(
      {
        userId: user.userId,
        role: user.role,
        phoneNumber,
        phoneVerified: true,
      },
      body.actionCategory,
    );
  }

  /** 성공 시 10분 action grant raw token을 한 번 반환한다 */
  @Post('challenges/:challengeId/verify')
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId') challengeId: string,
    @Body() body: { otp: string },
  ) {
    return this.stepUp.verify(user.userId, challengeId, body.otp);
  }
}

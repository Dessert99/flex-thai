/** 인증된 현재 사용자의 공개 프로필을 반환한다 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { meResponseSchema, type MeResponse } from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { CognitoAuthorizerGuard } from './cognito-authorizer.guard.js';

/** access token으로 조회하는 현재 사용자 endpoint */
@Controller('me')
@UseGuards(CognitoAuthorizerGuard)
export class MeController {
  /** guard가 DB와 연결한 최신 사용자 상태를 공개 계약으로 직렬화한다 */
  @Get()
  getMe(@CurrentUser() user: AuthenticatedUser): MeResponse {
    return meResponseSchema.parse({
      id: user.userId,
      email: user.email,
      role: user.role,
      mfaEnrolled: user.mfaEnrolledAt !== null,
    });
  }
}

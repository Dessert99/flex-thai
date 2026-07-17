/** 인증된 관리자의 private S3 upload policy와 완료 검증을 제공한다 */
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { UploadPolicyService, type InputType } from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApplicationRoleGuard } from '../auth/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../auth/cognito-authorizer.guard.js';
import { RequireRole } from '../auth/require-role.decorator.js';

/** Job 입력 object를 안전하게 준비하는 upload API */
@Controller('uploads')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('ADMIN')
export class UploadsController {
  constructor(private readonly uploads: UploadPolicyService) {}

  /** 클라이언트가 private S3에 직접 올릴 10분 POST policy를 만든다 */
  @Post('policies')
  createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      inputType: InputType;
      contentType: string;
      declaredSizeBytes: number;
    },
  ) {
    return this.uploads.createPolicy({
      ownerId: user.userId,
      ...body,
    });
  }

  /** S3 실제 object를 재검사해 VERIFIED 또는 REJECTED로 종료한다 */
  @Post(':uploadId/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') uploadId: string,
  ) {
    return this.uploads.complete(user.userId, uploadId);
  }
}

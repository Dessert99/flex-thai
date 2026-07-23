/** 인증된 현재 사용자의 공개 프로필을 반환한다 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { meResponseSchema, type MeResponse } from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApiProblemResponse } from '../openapi/openapi.decorators.js';
import { MeResponseDto, ProblemDetailsDto } from '../openapi/openapi.dto.js';
import { CognitoAuthorizerGuard } from './cognito-authorizer.guard.js';

/** access token으로 조회하는 현재 사용자 endpoint */
@ApiTags('Identity')
@ApiBearerAuth('accessToken')
@ApiExtraModels(ProblemDetailsDto)
@Controller('me')
@UseGuards(CognitoAuthorizerGuard)
export class MeController {
  /** guard가 DB와 연결한 최신 사용자 상태를 공개 계약으로 직렬화한다 */
  @ApiOperation({ summary: '현재 인증 사용자의 공개 상태를 조회한다' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiProblemResponse(401, 'access token이 없거나 올바르지 않음')
  @ApiProblemResponse(403, '현재 계정 상태가 요청을 허용하지 않음')
  @ApiProblemResponse(500, '예상하지 못한 서버 오류')
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

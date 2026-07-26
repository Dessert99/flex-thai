/** 인증 학습자의 문제·어휘 추천 HTTP 경계를 제공한다 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { RecommendationResponse } from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import { RecommendationResponseDto } from './recommendations.openapi.dto.js';
import { RecommendationsService } from './recommendations.service.js';

/** LEARNER와 상속된 ADMIN이 사용하는 추천 endpoint */
@ApiTags('Learner Recommendations')
@ApiBearerAuth('accessToken')
@ApiExtraModels(RecommendationResponseDto)
@Controller()
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('LEARNER')
export class LearnerRecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  /** 현재 원시 학습 기록에서 문제·어휘 추천을 한 번에 조회한다 */
  @Get('me/recommendations')
  @ApiOperation({ summary: '내 문제·어휘 추천을 조회한다' })
  @ApiOkResponse({ type: RecommendationResponseDto })
  @ApiProblemResponses(401, 403, 500)
  getForUser(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecommendationResponse> {
    return this.recommendations.getForUser(user.userId);
  }
}

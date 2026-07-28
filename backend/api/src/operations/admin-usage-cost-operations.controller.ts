/** ADMIN·MFA 사용량·비용 overview와 경고 설정 HTTP 경계를 제공한다 */
import {
  Body,
  ConflictException,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  operationsCostSettingsResponseSchema,
  updateOperationsCostSettingsRequestSchema,
  usageCostOverviewQuerySchema,
  usageCostOverviewResponseSchema,
} from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import {
  OperationsCostSettingsResponseDto,
  UpdateOperationsCostSettingsRequestDto,
  UsageCostOverviewQueryDto,
  UsageCostOverviewResponseDto,
} from './usage-cost-operations.dto.js';
import {
  UsageCostOperationsError,
  UsageCostOperationsService,
} from './usage-cost-operations.service.js';

/** 관리자 사용량·비용 endpoint */
@ApiTags('Admin Usage Cost')
@ApiBearerAuth('accessToken')
@Controller('admin/usage-cost')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminUsageCostOperationsController {
  constructor(private readonly usageCost: UsageCostOperationsService) {}

  /** 기간별 AI·TTS 비용과 운영 aggregate를 반환한다 */
  @ApiOperation({ summary: 'AI·TTS 사용량과 예상 비용을 조회한다' })
  @ApiQuery({ type: UsageCostOverviewQueryDto })
  @ApiOkResponse({ type: UsageCostOverviewResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get()
  async overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: Record<string, unknown>,
  ) {
    const query = usageCostOverviewQuerySchema.parse(rawQuery);
    return usageCostOverviewResponseSchema.parse(
      await this.usageCost.overview({ role: user.role }, query),
    );
  }

  /** 현재 비용 경고 singleton을 반환한다 */
  @ApiOperation({ summary: '비용 경고 설정을 조회한다' })
  @ApiOkResponse({ type: OperationsCostSettingsResponseDto })
  @ApiProblemResponses(401, 403, 500)
  @Get('settings')
  async settings(@CurrentUser() user: AuthenticatedUser) {
    return operationsCostSettingsResponseSchema.parse(
      await this.usageCost.settings({ role: user.role }),
    );
  }

  /** optimistic request로 비용 경고 singleton을 변경한다 */
  @ApiOperation({ summary: '비용 경고 설정을 변경한다' })
  @ApiBody({ type: UpdateOperationsCostSettingsRequestDto })
  @ApiOkResponse({ type: OperationsCostSettingsResponseDto })
  @ApiProblemResponses(400, 401, 403, 409, 500)
  @Put('settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
  ) {
    const input = updateOperationsCostSettingsRequestSchema.parse(rawBody);
    try {
      return operationsCostSettingsResponseSchema.parse(
        await this.usageCost.updateSettings(
          { role: user.role, userId: user.userId, sub: user.sub },
          input,
        ),
      );
    } catch (error) {
      if (
        error instanceof UsageCostOperationsError &&
        error.code === 'OPERATIONS_COST_SETTINGS_CONFLICT'
      ) {
        throw new ConflictException({ code: error.code });
      }
      throw error;
    }
  }
}

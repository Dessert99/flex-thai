/** ADMIN·MFA로 보호한 감사 기록 목록·상세 HTTP 경계를 제공한다 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  auditLogDetailResponseSchema,
  auditLogIdPathSchema,
  auditLogListQuerySchema,
  auditLogListResponseSchema,
  type AuditLogDetailResponse,
  type AuditLogListResponse,
} from '@flex-thia/contracts';
import {
  AuditLogService,
  type AuditLogDetail,
  type AuditLogListItem,
} from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import {
  AuditLogDetailResponseDto,
  AuditLogListQueryDto,
  AuditLogListResponseDto,
} from './audit-log.dto.js';

/** ADMIN과 TOTP 등록을 요구하는 감사 기록 endpoint */
@ApiTags('Admin Audit Logs')
@ApiBearerAuth('accessToken')
@Controller('admin/audit-logs')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AuditLogService) {}

  /** 검색·필터된 감사 기록 페이지를 반환한다 */
  @ApiOperation({ summary: '감사 기록 목록을 조회한다' })
  @ApiQuery({ type: AuditLogListQueryDto })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<AuditLogListResponse> {
    const query = auditLogListQuerySchema.parse(rawQuery);
    const page = await this.auditLogs.list(
      { role: user.role },
      {
        page: query.page,
        pageSize: query.pageSize,
        ...(query.query ? { query: query.query } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
        ...(query.from ? { from: new Date(query.from) } : {}),
        ...(query.to ? { to: new Date(query.to) } : {}),
      },
    );
    return auditLogListResponseSchema.parse({
      items: page.items.map(toListResponse),
      page: page.page,
    });
  }

  /** UUID 감사 기록의 summary와 request ID를 반환한다 */
  @ApiOperation({ summary: '감사 기록 상세를 조회한다' })
  @ApiParam({ name: 'auditLogId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: AuditLogDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get(':auditLogId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: unknown,
  ): Promise<AuditLogDetailResponse> {
    const path = auditLogIdPathSchema.parse(rawPath);
    const detail = await this.auditLogs.get(
      { role: user.role },
      path.auditLogId,
    );
    return auditLogDetailResponseSchema.parse({
      ...toListResponse(detail),
      summary: redactAuditSummary(detail.summary),
      requestId: detail.requestId,
    });
  }
}

const SENSITIVE_SUMMARY_KEYS = new Set([
  'apikey',
  'authorization',
  'challengetoken',
  'cookie',
  'idtoken',
  'otp',
  'otpcode',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'secretcode',
  'setcookie',
  'token',
  'totpcode',
]);

const SENSITIVE_SUMMARY_KEY_PATTERNS = [
  /token(?:value|hash)?$/u,
  /secret/u,
  /password/u,
  /credential/u,
  /private.*key/u,
  /(?:object|input|storage)key$/u,
  /otp/u,
  /authorization/u,
  /cookie/u,
  /(?:api|access|session|signing|encryption)key(?:id|value|hash)?$/u,
  /(?:auth|challenge|mfa|recovery|verification)code$/u,
];

const normalizeSummaryKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/gu, '');

const isSensitiveSummaryKey = (key: string) => {
  const normalized = normalizeSummaryKey(key);
  return (
    SENSITIVE_SUMMARY_KEYS.has(normalized) ||
    SENSITIVE_SUMMARY_KEY_PATTERNS.some((pattern) => pattern.test(normalized))
  );
};

const redactAuditSummaryValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactAuditSummaryValue);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      isSensitiveSummaryKey(key)
        ? '[REDACTED]'
        : redactAuditSummaryValue(nested),
    ]),
  );
};

const redactAuditSummary = (
  summary: Record<string, unknown>,
): Record<string, unknown> =>
  redactAuditSummaryValue(summary) as Record<string, unknown>;

const toListResponse = (item: AuditLogListItem | AuditLogDetail) => ({
  ...item,
  createdAt: item.createdAt.toISOString(),
});

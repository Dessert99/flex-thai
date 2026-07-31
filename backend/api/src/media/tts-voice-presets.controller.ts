/** ADMIN+MFA TTS voice preset version HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  changeTtsVoicePresetEnabledRequestSchema,
  createTtsVoicePresetRequestSchema,
  createTtsVoicePresetVersionRequestSchema,
  ttsVoicePresetDetailResponseSchema,
  ttsVoicePresetListQuerySchema,
  ttsVoicePresetListResponseSchema,
  ttsVoicePresetPathSchema,
} from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminRequestId } from '../common/http/admin-request-id.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import { ProblemDetailsDto } from '../openapi/openapi.dto.js';
import {
  ChangeTtsVoicePresetEnabledRequestDto,
  CreateTtsVoicePresetRequestDto,
  CreateTtsVoicePresetVersionRequestDto,
  TtsVoicePresetDetailResponseDto,
  TtsVoicePresetListQueryDto,
  TtsVoicePresetListResponseDto,
} from './tts-voice-presets.dto.js';
import { TtsVoicePresetsService } from './tts-voice-presets.service.js';

const actorContext = (user: AuthenticatedUser, requestId: string) => ({
  userId: user.userId,
  sub: user.sub,
  requestId,
});

/** ADMIN과 MFA를 요구하는 TTS voice preset endpoint */
@ApiTags('Admin TTS Presets')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  TtsVoicePresetListQueryDto,
  TtsVoicePresetListResponseDto,
  TtsVoicePresetDetailResponseDto,
  CreateTtsVoicePresetRequestDto,
  CreateTtsVoicePresetVersionRequestDto,
  ChangeTtsVoicePresetEnabledRequestDto,
)
@Controller('admin/tts/presets')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class TtsVoicePresetsController {
  constructor(private readonly service: TtsVoicePresetsService) {}

  /** TTS voice preset version page를 조회한다 */
  @ApiOperation({ summary: 'TTS voice preset 목록을 조회한다' })
  @ApiQuery({ type: TtsVoicePresetListQueryDto })
  @ApiOkResponse({ type: TtsVoicePresetListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get()
  async list(@Query() rawQuery: Record<string, unknown>) {
    return ttsVoicePresetListResponseSchema.parse(
      await this.service.list(ttsVoicePresetListQuerySchema.parse(rawQuery)),
    );
  }

  /** 최초 TTS voice preset version을 생성한다 */
  @ApiOperation({ summary: 'TTS voice preset을 생성한다' })
  @ApiBody({ type: CreateTtsVoicePresetRequestDto })
  @ApiCreatedResponse({ type: TtsVoicePresetDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 409, 500)
  @Post()
  @HttpCode(201)
  async createPreset(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Body() rawBody: unknown,
  ) {
    return ttsVoicePresetDetailResponseSchema.parse(
      await this.service.createPreset(
        actorContext(user, requestId),
        createTtsVoicePresetRequestSchema.parse(rawBody),
      ),
    );
  }

  /** TTS voice preset 상세를 조회한다 */
  @ApiOperation({ summary: 'TTS voice preset 상세를 조회한다' })
  @ApiParam({ name: 'presetId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: TtsVoicePresetDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get(':presetId')
  get(@Param() rawPath: Record<string, unknown>) {
    const { presetId } = ttsVoicePresetPathSchema.parse(rawPath);
    return this.service.get(presetId);
  }

  /** 기존 이름의 새 immutable TTS voice preset version을 생성한다 */
  @ApiOperation({ summary: '새 TTS voice preset version을 생성한다' })
  @ApiParam({ name: 'presetId', type: 'string', format: 'uuid' })
  @ApiBody({ type: CreateTtsVoicePresetVersionRequestDto })
  @ApiCreatedResponse({ type: TtsVoicePresetDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':presetId/versions')
  @HttpCode(201)
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    const { presetId } = ttsVoicePresetPathSchema.parse(rawPath);
    return this.service.createVersion(
      actorContext(user, requestId),
      presetId,
      createTtsVoicePresetVersionRequestSchema.parse(rawBody),
    );
  }

  /** TTS voice preset을 새 작업에서 선택 가능하게 한다 */
  @ApiOperation({ summary: 'TTS voice preset을 활성화한다' })
  @ApiParam({ name: 'presetId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ChangeTtsVoicePresetEnabledRequestDto })
  @ApiOkResponse({ type: TtsVoicePresetDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':presetId/enable')
  enablePreset(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    const { presetId } = ttsVoicePresetPathSchema.parse(rawPath);
    return this.service.enablePreset(
      actorContext(user, requestId),
      presetId,
      changeTtsVoicePresetEnabledRequestSchema.parse(rawBody),
    );
  }

  /** configured active가 아닌 TTS voice preset을 비활성화한다 */
  @ApiOperation({ summary: 'TTS voice preset을 비활성화한다' })
  @ApiParam({ name: 'presetId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ChangeTtsVoicePresetEnabledRequestDto })
  @ApiOkResponse({ type: TtsVoicePresetDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':presetId/disable')
  disablePreset(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ) {
    const { presetId } = ttsVoicePresetPathSchema.parse(rawPath);
    return this.service.disablePreset(
      actorContext(user, requestId),
      presetId,
      changeTtsVoicePresetEnabledRequestSchema.parse(rawBody),
    );
  }
}

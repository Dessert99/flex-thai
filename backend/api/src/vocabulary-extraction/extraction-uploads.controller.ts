import { extractionUploadPathSchema } from '@flex-thia/contracts/vocabulary-extraction/uploads';
import { Inject } from '@nestjs/common';
import { UploadPolicyService } from '@flex-thia/domain/uploads/upload-policy.service';
export const EXTRACTION_UPLOAD_POLICIES = Symbol('EXTRACTION_UPLOAD_POLICIES');
/** ADMIN+MFA 단어 추출 upload·preset·작업 HTTP 경계를 제공한다 */
import {
  completedUploadResponseSchema,
  uploadPolicyRequestSchema,
  uploadPolicyResponseSchema,
} from '@flex-thia/contracts/vocabulary-extraction/uploads';

import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
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
  CompletedExtractionUploadResponseDto,
  ExtractionUploadPolicyRequestDto,
  ExtractionUploadPolicyResponseDto,
} from './extraction-uploads.dto.js';

/** ADMIN과 MFA를 요구하는 단어 추출 endpoint 집합 */
@ApiTags('Admin Vocabulary Extraction Uploads')
@ApiBearerAuth('accessToken')
@Controller('admin/vocabulary-extraction')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class ExtractionUploadsController {
  constructor(
    @Inject(EXTRACTION_UPLOAD_POLICIES)
    private readonly uploads: UploadPolicyService,
  ) {}

  /** private 입력 object의 exact key upload policy를 준비한다 */
  @ApiOperation({ summary: '단어 추출 입력 upload policy를 준비한다' })
  @ApiBody({ type: ExtractionUploadPolicyRequestDto })
  @ApiCreatedResponse({ type: ExtractionUploadPolicyResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Post('uploads/policies')
  @HttpCode(201)
  async createUploadPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
  ) {
    return uploadPolicyResponseSchema.parse(
      await this.uploads.createPolicy({
        ownerId: user.userId,
        ...uploadPolicyRequestSchema.parse(rawBody),
      }),
    );
  }

  /** 실제 object를 재검사해 VERIFIED 입력으로 완료한다 */
  @ApiOperation({ summary: '단어 추출 입력 upload를 검사해 완료한다' })
  @ApiParam({ name: 'uploadId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: CompletedExtractionUploadResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Post('uploads/:uploadId/complete')
  @HttpCode(200)
  async completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ) {
    const { uploadId } = extractionUploadPathSchema.parse(rawPath);
    const completed = await this.uploads.complete(user.userId, uploadId);
    return completedUploadResponseSchema.parse({
      uploadId: completed.id,
      inputType: completed.inputType,
      sizeBytes: completed.sizeBytes,
      status: completed.status,
    });
  }
}

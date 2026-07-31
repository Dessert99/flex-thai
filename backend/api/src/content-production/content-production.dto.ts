/** content-production Zod 계약을 Swagger reflection DTO로 연결한다 */
import {
  completedUploadResponseSchema,
  contentProductionJobDetailResponseSchema,
  contentProductionJobListQuerySchema,
  contentProductionJobListResponseSchema,
  contentProductionJobPathSchema,
  contentProductionJobSummarySchema,
  contentProductionPresetListResponseSchema,
  contentProductionPresetPathSchema,
  contentProductionUploadPathSchema,
  promptPreviewResponseSchema,
  setContentProductionPresetEnabledRequestSchema,
  uploadPolicyRequestSchema,
  uploadPolicyResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** upload 정책 요청 Swagger DTO */
export class ContentProductionUploadPolicyRequestDto extends createZodDto(
  uploadPolicyRequestSchema,
) {}

/** upload 정책 응답 Swagger DTO */
export class ContentProductionUploadPolicyResponseDto extends createZodDto(
  uploadPolicyResponseSchema,
) {}

/** upload path Swagger DTO */
export class ContentProductionUploadPathDto extends createZodDto(
  contentProductionUploadPathSchema,
) {}

/** 완료 검증된 upload 응답 Swagger DTO */
export class CompletedContentProductionUploadResponseDto extends createZodDto(
  completedUploadResponseSchema,
) {}

/** preset 목록 응답 Swagger DTO */
export class ContentProductionPresetListResponseDto extends createZodDto(
  contentProductionPresetListResponseSchema,
) {}

/** 작업 생성 요청 Swagger DTO */
export class CreateContentProductionJobRequestDto {
  clientRequestId!: string;
  uploadIds!: string[];
  purpose!: string;
  presetId!: string;
  options!: unknown;
}

/** 작업 요약 응답 Swagger DTO */
export class ContentProductionJobSummaryDto extends createZodDto(
  contentProductionJobSummarySchema,
) {}

/** 작업 목록 query Swagger DTO */
export class ContentProductionJobListQueryDto extends createZodDto(
  contentProductionJobListQuerySchema,
) {}

/** 작업 목록 응답 Swagger DTO */
export class ContentProductionJobListResponseDto extends createZodDto(
  contentProductionJobListResponseSchema,
) {}

/** 작업 path Swagger DTO */
export class ContentProductionJobPathDto extends createZodDto(
  contentProductionJobPathSchema,
) {}

/** 작업 상세 응답 Swagger DTO */
export class ContentProductionJobDetailResponseDto extends createZodDto(
  contentProductionJobDetailResponseSchema,
) {}

/** prompt preview 요청 Swagger DTO */
export class PromptPreviewRequestDto {
  purpose!: string;
  presetId!: string;
  options!: unknown;
  questionPlanIndex!: number;
}

/** prompt preview 응답 Swagger DTO */
export class PromptPreviewResponseDto extends createZodDto(
  promptPreviewResponseSchema,
) {}

/** preset path Swagger DTO */
export class ContentProductionPresetPathDto extends createZodDto(
  contentProductionPresetPathSchema,
) {}

/** preset version 목록 응답 Swagger DTO */
export class ContentProductionPresetVersionListResponseDto {
  items!: unknown[];
}

/** 단일 preset version 응답 Swagger DTO */
export class ContentProductionPresetVersionResponseDto {
  id!: string;
  name!: string;
  version!: number;
  purpose!: string;
  parameters!: unknown;
  enabled!: boolean;
  revision!: number;
  createdAt!: string;
}

/** 최초 preset 생성 요청 Swagger DTO */
export class CreateContentProductionPresetRequestDto {
  requestId!: string;
  name!: string;
  purpose!: string;
  parameters!: unknown;
}

/** 다음 preset version 생성 요청 Swagger DTO */
export class CreateContentProductionPresetVersionRequestDto {
  requestId!: string;
  purpose!: string;
  parameters!: unknown;
}

/** preset enabled 변경 요청 Swagger DTO */
export class SetContentProductionPresetEnabledRequestDto extends createZodDto(
  setContentProductionPresetEnabledRequestSchema,
) {}

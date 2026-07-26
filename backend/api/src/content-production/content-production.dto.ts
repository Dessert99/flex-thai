/** content-production Zod 계약을 Swagger reflection DTO로 연결한다 */
import {
  completedUploadResponseSchema,
  contentProductionJobDetailResponseSchema,
  contentProductionJobListQuerySchema,
  contentProductionJobListResponseSchema,
  contentProductionJobPathSchema,
  contentProductionJobSummarySchema,
  contentProductionPresetListResponseSchema,
  contentProductionUploadPathSchema,
  createContentProductionJobRequestSchema,
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
export class CreateContentProductionJobRequestDto extends createZodDto(
  createContentProductionJobRequestSchema,
) {}

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

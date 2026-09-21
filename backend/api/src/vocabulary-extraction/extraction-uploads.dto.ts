/** 단어 추출 Zod 계약을 Swagger reflection DTO로 연결한다 */
import {
  completedUploadResponseSchema,
  extractionUploadPathSchema,
  uploadPolicyRequestSchema,
  uploadPolicyResponseSchema,
} from '@flex-thia/contracts/vocabulary-extraction/uploads';
import { createZodDto } from 'nestjs-zod';

/** upload 정책 요청 Swagger DTO */
export class ExtractionUploadPolicyRequestDto extends createZodDto(
  uploadPolicyRequestSchema,
) {}

/** upload 정책 응답 Swagger DTO */
export class ExtractionUploadPolicyResponseDto extends createZodDto(
  uploadPolicyResponseSchema,
) {}

/** upload path Swagger DTO */
export class ExtractionUploadPathDto extends createZodDto(
  extractionUploadPathSchema,
) {}

/** 완료 검증된 upload 응답 Swagger DTO */
export class CompletedExtractionUploadResponseDto extends createZodDto(
  completedUploadResponseSchema,
) {}

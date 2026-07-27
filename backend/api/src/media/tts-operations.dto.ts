/** TTS 운영 Zod 계약을 Swagger reflection DTO로 연결한다 */
import {
  retryTtsItemRequestSchema,
  retryTtsJobRequestSchema,
  ttsJobDetailResponseSchema,
  ttsJobItemsQuerySchema,
  ttsJobListQuerySchema,
  ttsJobListResponseSchema,
  ttsRetryResponseSchema,
} from '../../../../shared/contracts/src/media/tts-operations.js';
import { createZodDto } from 'nestjs-zod';

/** TTS 작업 목록 query DTO */
export class TtsJobListQueryDto extends createZodDto(ttsJobListQuerySchema) {}

/** TTS 작업 항목 query DTO */
export class TtsJobItemsQueryDto extends createZodDto(ttsJobItemsQuerySchema) {}

/** TTS 작업 목록 응답 DTO */
export class TtsJobListResponseDto extends createZodDto(
  ttsJobListResponseSchema,
) {}

/** TTS 작업 상세 응답 DTO */
export class TtsJobDetailResponseDto extends createZodDto(
  ttsJobDetailResponseSchema,
) {}

/** TTS 작업 일괄 재시도 요청 DTO */
export class RetryTtsJobRequestDto extends createZodDto(
  retryTtsJobRequestSchema,
) {}

/** TTS 항목 개별 재시도 요청 DTO */
export class RetryTtsItemRequestDto extends createZodDto(
  retryTtsItemRequestSchema,
) {}

/** TTS 재시도 접수 응답 DTO */
export class TtsRetryResponseDto extends createZodDto(ttsRetryResponseSchema) {}

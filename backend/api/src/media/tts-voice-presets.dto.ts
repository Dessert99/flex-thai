/** TTS voice preset Zod 계약을 Swagger reflection DTO로 연결한다 */
import {
  changeTtsVoicePresetEnabledRequestSchema,
  createTtsVoicePresetRequestSchema,
  createTtsVoicePresetVersionRequestSchema,
  ttsVoicePresetDetailResponseSchema,
  ttsVoicePresetListQuerySchema,
  ttsVoicePresetListResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** TTS voice preset 목록 query DTO */
export class TtsVoicePresetListQueryDto extends createZodDto(
  ttsVoicePresetListQuerySchema,
) {}

/** 최초 TTS voice preset 생성 DTO */
export class CreateTtsVoicePresetRequestDto extends createZodDto(
  createTtsVoicePresetRequestSchema,
) {}

/** 새 TTS voice preset version 생성 DTO */
export class CreateTtsVoicePresetVersionRequestDto extends createZodDto(
  createTtsVoicePresetVersionRequestSchema,
) {}

/** TTS voice preset enabled 변경 DTO */
export class ChangeTtsVoicePresetEnabledRequestDto extends createZodDto(
  changeTtsVoicePresetEnabledRequestSchema,
) {}

/** TTS voice preset 목록 응답 DTO */
export class TtsVoicePresetListResponseDto extends createZodDto(
  ttsVoicePresetListResponseSchema,
) {}

/** TTS voice preset 상세 응답 DTO */
export class TtsVoicePresetDetailResponseDto extends createZodDto(
  ttsVoicePresetDetailResponseSchema,
) {}

/** 공개 Zod 계약을 Nest Swagger reflection DTO로 연결한다 */

import { problemDetailsSchema } from '@flex-thia/contracts/common/problem';
import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@flex-thia/contracts/health/status';
import {
  authenticatedResponseSchema,
  confirmEmailLinkRequestSchema,
  emailAuthenticationChallengeResponseSchema,
  meResponseSchema,
  mfaRequiredResponseSchema,
  startEmailAuthenticationRequestSchema,
  totpChallengeRequestSchema,
  verifyEmailCodeRequestSchema,
} from '@flex-thia/contracts/identity/auth';
import {
  vocabularyDetailResponseSchema,
  vocabularyIdPathSchema,
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
} from '@flex-thia/contracts/learning/vocabularies';
import {
  vocabularyWordbookMembershipResponseSchema,
  wordbookBulkItemsRequestSchema,
  wordbookItemListQuerySchema,
  wordbookItemListResponseSchema,
  wordbookListResponseSchema,
  wordbookNameRequestSchema,
  wordbookRemoveItemsRequestSchema,
  wordbookResponseSchema,
} from '@flex-thia/contracts/learning/wordbooks';
import { createZodDto } from 'nestjs-zod';

/** 이메일 challenge 시작 요청 Swagger DTO */
export class StartEmailAuthenticationRequestDto extends createZodDto(
  startEmailAuthenticationRequestSchema,
) {}

/** 계정 존재 여부를 숨기는 이메일 challenge 응답 Swagger DTO */
export class EmailAuthenticationChallengeResponseDto extends createZodDto(
  emailAuthenticationChallengeResponseSchema,
) {}

/** 이메일 코드 확인 요청 Swagger DTO */
export class VerifyEmailCodeRequestDto extends createZodDto(
  verifyEmailCodeRequestSchema,
) {}

/** 이메일 링크 확인 요청 Swagger DTO */
export class ConfirmEmailLinkRequestDto extends createZodDto(
  confirmEmailLinkRequestSchema,
) {}

/** access token과 공개 사용자를 포함한 인증 성공 Swagger DTO */
export class AuthenticatedResponseDto extends createZodDto(
  authenticatedResponseSchema,
) {}

/** TOTP challenge가 필요한 로그인 Swagger DTO */
export class MfaRequiredResponseDto extends createZodDto(
  mfaRequiredResponseSchema,
) {}

/** TOTP 로그인 challenge 요청 Swagger DTO */
export class TotpChallengeRequestDto extends createZodDto(
  totpChallengeRequestSchema,
) {}

/** 현재 사용자 응답 Swagger DTO */
export class MeResponseDto extends createZodDto(meResponseSchema) {}

/** API 생존 응답 Swagger DTO */
export class HealthResponseDto extends createZodDto(healthResponseSchema) {}

/** DB 준비 응답 Swagger DTO */
export class ReadinessResponseDto extends createZodDto(
  readinessResponseSchema,
) {}

/** RFC 9457 오류 응답 Swagger DTO */
export class ProblemDetailsDto extends createZodDto(problemDetailsSchema) {}

/** 어휘 목록 query Swagger DTO */
export class VocabularyListQueryDto extends createZodDto(
  vocabularyListQuerySchema,
) {}

/** 어휘 목록 성공 Swagger DTO */
export class VocabularyListResponseDto extends createZodDto(
  vocabularyListResponseSchema,
) {}

/** 어휘 상세 성공 Swagger DTO */
export class VocabularyDetailResponseDto extends createZodDto(
  vocabularyDetailResponseSchema,
) {}

/** 어휘 UUID path Swagger DTO */
export class VocabularyIdPathDto extends createZodDto(vocabularyIdPathSchema) {}

/** 단어장 생성·이름 변경 요청 Swagger DTO */
export class WordbookNameRequestDto extends createZodDto(
  wordbookNameRequestSchema,
) {}

/** 단어장 생성·이름 변경 응답 Swagger DTO */
export class WordbookResponseDto extends createZodDto(wordbookResponseSchema) {}

/** 현재 사용자 단어장 목록 응답 Swagger DTO */
export class WordbookListResponseDto extends createZodDto(
  wordbookListResponseSchema,
) {}

/** 단어장 항목 목록 query Swagger DTO */
export class WordbookItemListQueryDto extends createZodDto(
  wordbookItemListQuerySchema,
) {}

/** 단어장 항목 목록 응답 Swagger DTO */
export class WordbookItemListResponseDto extends createZodDto(
  wordbookItemListResponseSchema,
) {}

/** 단어장 항목 복사·이동 요청 Swagger DTO */
export class WordbookBulkItemsRequestDto extends createZodDto(
  wordbookBulkItemsRequestSchema,
) {}

/** 단어장 항목 일괄 제거 요청 Swagger DTO */
export class WordbookRemoveItemsRequestDto extends createZodDto(
  wordbookRemoveItemsRequestSchema,
) {}

/** 어휘가 속한 현재 사용자 단어장 목록 응답 Swagger DTO */
export class VocabularyWordbookMembershipResponseDto extends createZodDto(
  vocabularyWordbookMembershipResponseSchema,
) {}

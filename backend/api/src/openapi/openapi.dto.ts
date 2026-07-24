/** 공개 Zod 계약을 Nest Swagger reflection DTO로 연결한다 */
import {
  adminQuestionDetailResponseSchema,
  adminQuestionIdPathSchema,
  adminQuestionListQuerySchema,
  adminQuestionListResponseSchema,
  adminQuestionValidationReportSchema,
  adminQuestionVersionIdPathSchema,
  adminQuestionVersionPayloadSchema,
  adminQuestionVersionResponseSchema,
  adminVocabularyDetailResponseSchema,
  adminVocabularyIdPathSchema,
  adminVocabularyListQuerySchema,
  adminVocabularyListResponseSchema,
  adminVocabularyReplaceRequestSchema,
  audioUploadRequestSchema,
  audioUploadResponseSchema,
  authenticatedResponseSchema,
  completeMediaAssetResponseSchema,
  contentImportDetailResponseSchema,
  contentImportIdPathSchema,
  contentImportListQuerySchema,
  contentImportListResponseSchema,
  contentImportRequestSchema,
  healthResponseSchema,
  loginRequestSchema,
  mediaAssetDetailResponseSchema,
  mediaAssetIdPathSchema,
  meResponseSchema,
  mfaRequiredResponseSchema,
  questionAttemptListQuerySchema,
  questionAttemptListResponseSchema,
  questionDetailResponseSchema,
  questionIdPathSchema,
  questionListQuerySchema,
  questionListResponseSchema,
  problemDetailsSchema,
  readinessResponseSchema,
  savedVocabularyListQuerySchema,
  savedVocabularyListResponseSchema,
  submitQuestionAttemptRequestSchema,
  submitQuestionAttemptResponseSchema,
  totpChallengeRequestSchema,
  totpSetupResponseSchema,
  totpSetupVerifyRequestSchema,
  vocabularyDetailResponseSchema,
  vocabularyIdPathSchema,
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
  vocabularyRelatedQuestionsQuerySchema,
  vocabularyRelatedQuestionsResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';
import type { ZodObject } from 'zod';

/** 로그인 요청 Swagger DTO */
export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

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

/** TOTP 등록 확인 요청 Swagger DTO */
export class TotpSetupVerifyRequestDto extends createZodDto(
  totpSetupVerifyRequestSchema,
) {}

/** TOTP 등록 secret 응답 Swagger DTO */
export class TotpSetupResponseDto extends createZodDto(
  totpSetupResponseSchema,
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

/** 문제 목록 query Swagger DTO */
export class QuestionListQueryDto extends createZodDto(
  questionListQuerySchema,
) {}

/** 문제 목록 성공 Swagger DTO */
export class QuestionListResponseDto extends createZodDto(
  questionListResponseSchema,
) {}

/** 문제 상세 성공 Swagger DTO */
export class QuestionDetailResponseDto extends createZodDto(
  questionDetailResponseSchema,
) {}

/** 문제 UUID path Swagger DTO */
export class QuestionIdPathDto extends createZodDto(questionIdPathSchema) {}

/** 답안 제출 요청 Swagger DTO */
export class SubmitQuestionAttemptRequestDto extends createZodDto(
  submitQuestionAttemptRequestSchema,
) {}

/** 답안 제출 성공 Swagger DTO */
export class SubmitQuestionAttemptResponseDto extends createZodDto(
  submitQuestionAttemptResponseSchema,
) {}

/** 원시 풀이 기록 query Swagger DTO */
export class QuestionAttemptListQueryDto extends createZodDto(
  questionAttemptListQuerySchema,
) {}

/** 원시 풀이 기록 성공 Swagger DTO */
export class QuestionAttemptListResponseDto extends createZodDto(
  questionAttemptListResponseSchema,
) {}

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

/** 어휘 관련 문제 query Swagger DTO */
export class VocabularyRelatedQuestionsQueryDto extends createZodDto(
  vocabularyRelatedQuestionsQuerySchema,
) {}

/** 어휘 관련 문제 성공 Swagger DTO */
export class VocabularyRelatedQuestionsResponseDto extends createZodDto(
  vocabularyRelatedQuestionsResponseSchema,
) {}

/** 저장 어휘 목록 query Swagger DTO */
export class SavedVocabularyListQueryDto extends createZodDto(
  savedVocabularyListQuerySchema,
) {}

/** 저장 어휘 목록 성공 Swagger DTO */
export class SavedVocabularyListResponseDto extends createZodDto(
  savedVocabularyListResponseSchema,
) {}

/** canonical 콘텐츠 가져오기 요청 Swagger DTO */
export class ContentImportRequestDto extends createZodDto(
  contentImportRequestSchema,
) {}

/** 콘텐츠 가져오기 목록 query Swagger DTO */
export class ContentImportListQueryDto extends createZodDto(
  contentImportListQuerySchema,
) {}

/** 콘텐츠 가져오기 UUID path Swagger DTO */
export class ContentImportIdPathDto extends createZodDto(
  contentImportIdPathSchema,
) {}

/** 콘텐츠 가져오기 상세 Swagger DTO */
export class ContentImportDetailResponseDto extends createZodDto(
  contentImportDetailResponseSchema,
) {}

/** 콘텐츠 가져오기 이력 page Swagger DTO */
export class ContentImportListResponseDto extends createZodDto(
  contentImportListResponseSchema,
) {}

/** audio upload 선언 요청 Swagger DTO */
export class AudioUploadRequestDto extends createZodDto(
  audioUploadRequestSchema,
) {}

/** audio upload 준비 또는 재사용 응답 Swagger DTO */
export class AudioUploadResponseDto extends createZodDto(
  audioUploadResponseSchema as unknown as ZodObject,
) {}

/** media asset UUID path Swagger DTO */
export class MediaAssetIdPathDto extends createZodDto(mediaAssetIdPathSchema) {}

/** media asset 완료 응답 Swagger DTO */
export class CompleteMediaAssetResponseDto extends createZodDto(
  completeMediaAssetResponseSchema,
) {}

/** media asset 상태·사용처 상세 Swagger DTO */
export class MediaAssetDetailResponseDto extends createZodDto(
  mediaAssetDetailResponseSchema as unknown as ZodObject,
) {}

/** 관리자 문제 목록 query Swagger DTO */
export class AdminQuestionListQueryDto extends createZodDto(
  adminQuestionListQuerySchema,
) {}

/** 관리자 문제 목록 page Swagger DTO */
export class AdminQuestionListResponseDto extends createZodDto(
  adminQuestionListResponseSchema,
) {}

/** 관리자 문제 상세 Swagger DTO */
export class AdminQuestionDetailResponseDto extends createZodDto(
  adminQuestionDetailResponseSchema,
) {}

/** 관리자 문제 UUID path Swagger DTO */
export class AdminQuestionIdPathDto extends createZodDto(
  adminQuestionIdPathSchema,
) {}

/** 관리자 문제 버전 UUID path Swagger DTO */
export class AdminQuestionVersionIdPathDto extends createZodDto(
  adminQuestionVersionIdPathSchema,
) {}

/** 관리자 문제 버전 전체 교체 Swagger DTO */
export class AdminQuestionVersionPayloadDto extends createZodDto(
  adminQuestionVersionPayloadSchema,
) {}

/** 관리자 문제 DRAFT 요약 Swagger DTO */
export class AdminQuestionVersionResponseDto extends createZodDto(
  adminQuestionVersionResponseSchema,
) {}

/** 관리자 문제 검증 보고서 Swagger DTO */
export class AdminQuestionValidationReportDto extends createZodDto(
  adminQuestionValidationReportSchema,
) {}

/** 관리자 어휘 목록 query Swagger DTO */
export class AdminVocabularyListQueryDto extends createZodDto(
  adminVocabularyListQuerySchema,
) {}

/** 관리자 어휘 목록 page Swagger DTO */
export class AdminVocabularyListResponseDto extends createZodDto(
  adminVocabularyListResponseSchema,
) {}

/** 관리자 어휘 상세 Swagger DTO */
export class AdminVocabularyDetailResponseDto extends createZodDto(
  adminVocabularyDetailResponseSchema,
) {}

/** 관리자 어휘 UUID path Swagger DTO */
export class AdminVocabularyIdPathDto extends createZodDto(
  adminVocabularyIdPathSchema,
) {}

/** 관리자 어휘 전체 교체 요청 Swagger DTO */
export class AdminVocabularyReplaceRequestDto extends createZodDto(
  adminVocabularyReplaceRequestSchema,
) {}

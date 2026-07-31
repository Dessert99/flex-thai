/** 공개 Zod 계약을 Nest Swagger reflection DTO로 연결한다 */
import {
  adminQuestionDetailResponseSchema,
  adminQuestionIdPathSchema,
  adminQuestionListQuerySchema,
  adminQuestionListResponseSchema,
  adminQuestionTtsJobPathSchema,
  adminQuestionTtsJobResponseSchema,
  adminQuestionValidationReportSchema,
  adminQuestionVersionIdPathSchema,
  adminQuestionVersionPayloadSchema,
  adminQuestionVersionResponseSchema,
  adminVocabularyDetailResponseSchema,
  adminVocabularyIdPathSchema,
  adminVocabularyListQuerySchema,
  adminVocabularyListResponseSchema,
  adminVocabularyReplaceRequestSchema,
  adminVocabularyMergeExecuteRequestSchema,
  adminVocabularyMergePreviewRequestSchema,
  adminVocabularyMergePreviewResponseSchema,
  adminVocabularyMergeResponseSchema,
  adminVocabularyRelationCreateRequestSchema,
  adminVocabularyRelationPathSchema,
  adminVocabularyRelationSchema,
  adminVocabularyRelationUpdateRequestSchema,
  audioUploadRequestSchema,
  audioUploadResponseSchema,
  authenticatedResponseSchema,
  betaInvitationRequestSchema,
  betaInvitationResponseSchema,
  completeMediaAssetResponseSchema,
  confirmEmailLinkRequestSchema,
  contentImportDetailResponseSchema,
  contentImportIdPathSchema,
  contentImportListQuerySchema,
  contentImportListResponseSchema,
  contentImportRequestSchema,
  emailAuthenticationChallengeResponseSchema,
  healthResponseSchema,
  managedIdentityUserResponseSchema,
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
  startEmailAuthenticationRequestSchema,
  submitQuestionAttemptRequestSchema,
  submitQuestionAttemptResponseSchema,
  totpChallengeRequestSchema,
  totpSetupResponseSchema,
  totpSetupVerifyRequestSchema,
  userManagementListResponseSchema,
  userStatusUpdateRequestSchema,
  vocabularyDetailResponseSchema,
  vocabularyIdPathSchema,
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
  vocabularyRelatedQuestionsQuerySchema,
  vocabularyRelatedQuestionsResponseSchema,
  vocabularyWordbookMembershipResponseSchema,
  verifyEmailCodeRequestSchema,
  wordbookBulkItemsRequestSchema,
  wordbookItemListQuerySchema,
  wordbookItemListResponseSchema,
  wordbookListResponseSchema,
  wordbookNameRequestSchema,
  wordbookRemoveItemsRequestSchema,
  wordbookResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';
import type { ZodObject } from 'zod';

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

/** 관리자 사용자 목록 응답 Swagger DTO */
export class UserManagementListResponseDto extends createZodDto(
  userManagementListResponseSchema,
) {}

/** 관리자 사용자 상태 응답 Swagger DTO */
export class ManagedIdentityUserResponseDto extends createZodDto(
  managedIdentityUserResponseSchema,
) {}

/** 관리자 사용자 상태 변경 요청 Swagger DTO */
export class UserStatusUpdateRequestDto extends createZodDto(
  userStatusUpdateRequestSchema,
) {}

/** beta 안내 발송 기록 요청 Swagger DTO */
export class BetaInvitationRequestDto extends createZodDto(
  betaInvitationRequestSchema,
) {}

/** beta 안내 발송 기록 응답 Swagger DTO */
export class BetaInvitationResponseDto extends createZodDto(
  betaInvitationResponseSchema,
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

/** 관리자 문제 버전 TTS 경로 Swagger DTO */
export class AdminQuestionTtsJobPathDto extends createZodDto(
  adminQuestionTtsJobPathSchema,
) {}

/** 관리자 문제 버전 TTS 생성 결과 Swagger DTO */
export class AdminQuestionTtsJobResponseDto extends createZodDto(
  adminQuestionTtsJobResponseSchema,
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

/** 관리자 뜻 관계 경로 Swagger DTO */
export class AdminVocabularyRelationPathDto extends createZodDto(
  adminVocabularyRelationPathSchema,
) {}

/** 관리자 뜻 관계 생성 Swagger DTO */
export class AdminVocabularyRelationCreateRequestDto extends createZodDto(
  adminVocabularyRelationCreateRequestSchema,
) {}

/** 관리자 뜻 관계 수정 Swagger DTO */
export class AdminVocabularyRelationUpdateRequestDto extends createZodDto(
  adminVocabularyRelationUpdateRequestSchema,
) {}

/** 관리자 뜻 관계 응답 Swagger DTO */
export class AdminVocabularyRelationDto extends createZodDto(
  adminVocabularyRelationSchema,
) {}

/** 관리자 어휘 병합 preview 요청 Swagger DTO */
export class AdminVocabularyMergePreviewRequestDto extends createZodDto(
  adminVocabularyMergePreviewRequestSchema,
) {}

/** 관리자 어휘 병합 preview 응답 Swagger DTO */
export class AdminVocabularyMergePreviewResponseDto extends createZodDto(
  adminVocabularyMergePreviewResponseSchema,
) {}

/** 관리자 어휘 병합 실행 요청 Swagger DTO */
export class AdminVocabularyMergeExecuteRequestDto extends createZodDto(
  adminVocabularyMergeExecuteRequestSchema,
) {}

/** 관리자 어휘 병합 결과 Swagger DTO */
export class AdminVocabularyMergeResponseDto extends createZodDto(
  adminVocabularyMergeResponseSchema,
) {}

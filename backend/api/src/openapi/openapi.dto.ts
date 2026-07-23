/** 공개 Zod 계약을 Nest Swagger reflection DTO로 연결한다 */
import {
  authenticatedResponseSchema,
  healthResponseSchema,
  loginRequestSchema,
  meResponseSchema,
  mfaRequiredResponseSchema,
  problemDetailsSchema,
  readinessResponseSchema,
  totpChallengeRequestSchema,
  totpSetupResponseSchema,
  totpSetupVerifyRequestSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

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

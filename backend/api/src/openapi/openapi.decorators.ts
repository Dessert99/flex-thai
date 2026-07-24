/** 반복되는 CSRF와 Problem Details Swagger metadata를 제공한다 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  AuthenticatedResponseDto,
  MfaRequiredResponseDto,
  ProblemDetailsDto,
} from './openapi.dto.js';

/** same-origin 쓰기 요청의 두 CSRF 조건을 문서화한다 */
export const ApiCsrfProtection = () =>
  applyDecorators(
    ApiHeader({
      name: 'Origin',
      required: true,
      description: '허용된 프론트엔드의 exact origin',
    }),
    ApiHeader({
      name: 'X-CSRF-Protection',
      required: true,
      schema: { type: 'string', enum: ['1'] },
    }),
  );

/** 공개 오류를 RFC 9457 media type과 공통 schema로 문서화한다 */
export const ApiProblemResponse = (status: number, description: string) =>
  ApiResponse({
    status,
    description,
    content: {
      'application/problem+json': {
        schema: { $ref: getSchemaPath(ProblemDetailsDto) },
      },
    },
  });

/** operation별 exact 오류 상태 집합을 같은 Problem Details 계약으로 문서화한다 */
export const ApiProblemResponses = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiProblemResponse(status, `HTTP ${status} 요청 처리 실패`),
    ),
  );

/** 인증 완료와 TOTP challenge 분기를 하나의 성공 응답으로 문서화한다 */
export const ApiAuthenticationResponse = () =>
  ApiCreatedResponse({
    content: {
      'application/json': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(AuthenticatedResponseDto) },
            { $ref: getSchemaPath(MfaRequiredResponseDto) },
          ],
        },
      },
    },
  });

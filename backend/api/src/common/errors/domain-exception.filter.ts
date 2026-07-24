/** 도메인 오류를 안정적인 HTTP code로 바꾸고 내부 정보를 숨긴다 */
import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ProblemDetailsResponse } from '@flex-thia/contracts';
import {
  AuthDomainError,
  IdentityDomainError,
  LearningDomainError,
  UploadPolicyError,
} from '@flex-thia/domain';
import { ZodError } from 'zod';
import type { StructuredLogger } from '../logging/structured-logger.js';

const INTERNAL_SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** 예외 filter가 HTTP adapter에 전달할 안전한 응답 */
export interface ErrorResponse {
  status: number;
  body: ProblemDetailsResponse;
}

const AUTH_STATUS: Record<AuthDomainError['code'], number> = {
  SCHOOL_EMAIL_REQUIRED: HttpStatus.BAD_REQUEST,
  CHALLENGE_INVALID: HttpStatus.UNAUTHORIZED,
  CHALLENGE_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  PASSWORD_POLICY_VIOLATION: HttpStatus.BAD_REQUEST,
  ACCOUNT_ALREADY_EXISTS: HttpStatus.CONFLICT,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  ADMIN_REQUIRED: HttpStatus.FORBIDDEN,
  PHONE_VERIFICATION_REQUIRED: HttpStatus.FORBIDDEN,
  STEP_UP_INVALID: HttpStatus.UNAUTHORIZED,
};

const APPLICATION_STATUS: Record<string, number> = {
  INVALID_JOB_REQUEST: HttpStatus.BAD_REQUEST,
  UPLOAD_NOT_VERIFIED: HttpStatus.BAD_REQUEST,
  JOB_INPUT_TOO_LARGE: HttpStatus.BAD_REQUEST,
  JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  DB_RESUMING: HttpStatus.SERVICE_UNAVAILABLE,
};

const IDENTITY_STATUS: Record<IdentityDomainError['code'], number> = {
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  INVALID_MFA_CHALLENGE: HttpStatus.UNAUTHORIZED,
  INVALID_TOTP: HttpStatus.UNAUTHORIZED,
  INVALID_REFRESH_TOKEN: HttpStatus.UNAUTHORIZED,
  AUTH_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  ACCOUNT_DISABLED: HttpStatus.FORBIDDEN,
};

const LEARNING_STATUS: Record<LearningDomainError['code'], number> = {
  QUESTION_UNAVAILABLE: HttpStatus.CONFLICT,
  QUESTION_OPTION_MISMATCH: HttpStatus.CONFLICT,
  ATTEMPT_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  VOCABULARY_UNAVAILABLE: HttpStatus.NOT_FOUND,
};

const readPublicCode = (value: unknown): string | null => {
  if (
    value &&
    typeof value === 'object' &&
    'code' in value &&
    typeof value.code === 'string'
  ) {
    return value.code;
  }

  return null;
};

const createProblem = (
  code: string,
  status: number,
  requestId: string,
  fieldErrors: ProblemDetailsResponse['fieldErrors'] = [],
): ProblemDetailsResponse => ({
  type: `https://flex-thia.example/problems/${code.toLowerCase().replaceAll('_', '-')}`,
  title: '요청을 처리할 수 없습니다.',
  status,
  code,
  requestId,
  fieldErrors,
});

/** 예외 종류를 production에서도 노출 가능한 Problem Details로 제한한다 */
export const buildErrorResponse = (
  error: unknown,
  requestId: string,
): ErrorResponse => {
  if (error instanceof AuthDomainError) {
    const status = AUTH_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof IdentityDomainError) {
    const status = IDENTITY_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof LearningDomainError) {
    const status = LEARNING_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof UploadPolicyError) {
    const status =
      error.code === 'UPLOAD_NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof ZodError) {
    const status = HttpStatus.BAD_REQUEST;
    return {
      status,
      body: createProblem(
        'INVALID_REQUEST',
        status,
        requestId,
        error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      ),
    };
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === INTERNAL_SERVER_ERROR_STATUS) {
      return {
        status,
        body: createProblem('INTERNAL_SERVER_ERROR', status, requestId),
      };
    }
    const publicCode = readPublicCode(error.getResponse());
    const code = publicCode ?? `HTTP_${status}`;
    return {
      status,
      body: createProblem(code, status, requestId),
    };
  }

  const applicationCode = readPublicCode(error);

  if (applicationCode && APPLICATION_STATUS[applicationCode]) {
    return {
      status: APPLICATION_STATUS[applicationCode],
      body: createProblem(
        applicationCode,
        APPLICATION_STATUS[applicationCode],
        requestId,
      ),
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: createProblem(
      'INTERNAL_SERVER_ERROR',
      HttpStatus.INTERNAL_SERVER_ERROR,
      requestId,
    ),
  };
};

type ErrorRequest = {
  headers?: Record<string, string | string[] | undefined>;
  route?: { path?: unknown };
  path?: unknown;
  url?: unknown;
  user?: { userId?: unknown };
};

type ErrorResponseAdapter = {
  type(value: string): ErrorResponseAdapter;
  status(code: number): ErrorResponseAdapter;
  json(body: ProblemDetailsResponse): void;
};

/** 예외 응답과 예상하지 못한 오류 로그에 같은 request id를 연결한다 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  /** NestJS 예외를 안전한 JSON 응답으로 종료한다 */
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ErrorRequest>();
    const response = http.getResponse<ErrorResponseAdapter>();
    const requestId = this.readRequestId(request);
    const result = buildErrorResponse(error, requestId);

    if (result.status === INTERNAL_SERVER_ERROR_STATUS) {
      this.logger.error('예상하지 못한 HTTP 요청 실패', {
        requestId,
        errorCode: result.body.code,
        route: this.readRoute(request),
        userId:
          typeof request.user?.userId === 'string' ? request.user.userId : null,
      });
    }
    response
      .type('application/problem+json')
      .status(result.status)
      .json(result.body);
  }

  private readRequestId(request: ErrorRequest): string {
    const value = request.headers?.['x-request-id'];
    return typeof value === 'string' && value ? value : randomUUID();
  }

  private readRoute(request: ErrorRequest): string {
    const value =
      typeof request.route?.path === 'string'
        ? request.route.path
        : typeof request.path === 'string'
          ? request.path
          : typeof request.url === 'string'
            ? request.url.split('?')[0]
            : undefined;
    return value || 'unknown';
  }
}

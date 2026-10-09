/** 도메인 오류를 안정적인 HTTP code로 바꾸고 내부 정보를 숨긴다 */
import type { ProblemDetailsResponse } from '@flex-thia/contracts/common/problem';
import { WordbookPersistenceError } from '@flex-thia/database/repositories/drizzle-wordbook.repository';

import { IdentityDomainError } from '@flex-thia/domain/identity/authentication.service';
import { EmailChallengeError } from '@flex-thia/domain/identity/email-challenge';

import { WordbookDomainError } from '@flex-thia/domain/learning/wordbook';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { resolveRequestId, type RequestIdRequest } from '../http/request-id.js';
import type { StructuredLogger } from '../logging/structured-logger.js';

const INTERNAL_SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** 예외 filter가 HTTP adapter에 전달할 안전한 응답 */
export interface ErrorResponse {
  status: number;
  body: ProblemDetailsResponse;
}

const APPLICATION_STATUS: Record<string, number> = {
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

const EMAIL_CHALLENGE_STATUS: Record<EmailChallengeError['code'], number> = {
  INVALID_SCHOOL_EMAIL: HttpStatus.BAD_REQUEST,
  CHALLENGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CHALLENGE_EXPIRED: HttpStatus.UNAUTHORIZED,
  CHALLENGE_ALREADY_USED: HttpStatus.CONFLICT,
  CHALLENGE_IN_PROGRESS: HttpStatus.CONFLICT,
  INVALID_CHALLENGE_ANSWER: HttpStatus.UNAUTHORIZED,
  CHALLENGE_ATTEMPTS_EXCEEDED: HttpStatus.UNAUTHORIZED,
  CHALLENGE_RESEND_COOLDOWN: HttpStatus.TOO_MANY_REQUESTS,
  EMAIL_DAILY_LIMIT_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
  GLOBAL_DAILY_LIMIT_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
};

const WORDBOOK_STATUS: Record<WordbookDomainError['code'], number> = {
  WORDBOOK_NAME_INVALID: HttpStatus.BAD_REQUEST,
  WORDBOOK_NOT_FOUND: HttpStatus.NOT_FOUND,
  WORDBOOK_SAME_TARGET: HttpStatus.BAD_REQUEST,
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
  if (error instanceof IdentityDomainError) {
    const status = IDENTITY_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof EmailChallengeError) {
    const status = EMAIL_CHALLENGE_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof WordbookDomainError) {
    const status = WORDBOOK_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof WordbookPersistenceError) {
    const status = HttpStatus.CONFLICT;
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

type ErrorRequest = RequestIdRequest & {
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
    const requestId = resolveRequestId(request);
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

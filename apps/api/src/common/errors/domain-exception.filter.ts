/** 도메인 오류를 안정적인 HTTP code로 바꾸고 내부 정보를 숨긴다 */
import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthDomainError, UploadPolicyError } from '@flex-thia/domain';
import type { StructuredLogger } from '../logging/structured-logger.js';

interface ErrorBody {
  code: string;
  message: string;
  requestId: string;
}

/** 예외 filter가 HTTP adapter에 전달할 안전한 응답 */
export interface ErrorResponse {
  status: number;
  body: ErrorBody;
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

/** 예외 종류를 production에서도 노출 가능한 code와 message로 제한한다 */
export const buildErrorResponse = (
  error: unknown,
  requestId: string,
  production: boolean,
): ErrorResponse => {
  if (error instanceof AuthDomainError) {
    return {
      status: AUTH_STATUS[error.code],
      body: { code: error.code, message: error.message, requestId },
    };
  }

  if (error instanceof UploadPolicyError) {
    const status =
      error.code === 'UPLOAD_NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
    return {
      status,
      body: { code: error.code, message: error.message, requestId },
    };
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    const publicCode = readPublicCode(error.getResponse());
    return {
      status,
      body: {
        code: publicCode ?? `HTTP_${status}`,
        message:
          status >= 500 && production
            ? 'INTERNAL_SERVER_ERROR'
            : (publicCode ?? error.message),
        requestId,
      },
    };
  }

  const applicationCode = readPublicCode(error);

  if (applicationCode && APPLICATION_STATUS[applicationCode]) {
    return {
      status: APPLICATION_STATUS[applicationCode],
      body: {
        code: applicationCode,
        message: applicationCode,
        requestId,
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        production || !(error instanceof Error)
          ? 'INTERNAL_SERVER_ERROR'
          : error.message,
      requestId,
    },
  };
};

type ErrorRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

type ErrorResponseAdapter = {
  status(code: number): ErrorResponseAdapter;
  json(body: ErrorBody): void;
};

/** 모든 예외 응답과 오류 로그에 같은 request id를 연결한다 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  /** NestJS 예외를 안전한 JSON 응답으로 종료한다 */
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ErrorRequest>();
    const response = http.getResponse<ErrorResponseAdapter>();
    const requestId = this.readRequestId(request);
    const result = buildErrorResponse(
      error,
      requestId,
      process.env.NODE_ENV === 'production',
    );

    this.logger.error('HTTP 요청 실패', {
      requestId,
      errorCode: result.body.code,
    });
    response.status(result.status).json(result.body);
  }

  private readRequestId(request: ErrorRequest): string {
    const value = request.headers?.['x-request-id'];
    return typeof value === 'string' && value ? value : randomUUID();
  }
}

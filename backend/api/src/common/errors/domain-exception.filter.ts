/** 도메인 오류를 안정적인 HTTP code로 바꾸고 내부 정보를 숨긴다 */
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ProblemDetailsResponse } from '@flex-thia/contracts';
import { WordbookPersistenceError } from '@flex-thia/database';
import {
  AuthDomainError,
  AuditLogError,
  ContentImportError,
  EmailChallengeError,
  IdentityDomainError,
  LearningDomainError,
  MediaAssetDomainError,
  QuestionAdminError,
  QuestionPublicationError,
  QuestionTaxonomyError,
  UploadPolicyError,
  UserManagementError,
  VocabularyAdminError,
  VocabularyRelationsMergeAdminError,
  WordbookDomainError,
} from '@flex-thia/domain';
import { ZodError } from 'zod';
import {
  resolveAdminRequestId,
  type AdminRequestIdRequest,
} from '../http/admin-request-id.js';
import type { StructuredLogger } from '../logging/structured-logger.js';

const INTERNAL_SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** 예외 filter가 HTTP adapter에 전달할 안전한 응답 */
export interface ErrorResponse {
  status: number;
  body: ProblemDetailsResponse;
}

const AUTH_STATUS: Record<AuthDomainError['code'], number> = {
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
  CONTENT_DRAFT_ITEM_CONFLICT: HttpStatus.CONFLICT,
  CONTENT_DRAFT_PERSISTENCE_CONFLICT: HttpStatus.CONFLICT,
  CONTENT_IMPORT_PERSISTENCE_CONFLICT: HttpStatus.CONFLICT,
  MEDIA_ADMIN_PERSISTENCE_CONFLICT: HttpStatus.CONFLICT,
  QUESTION_ADMIN_PERSISTENCE_CONFLICT: HttpStatus.CONFLICT,
  QUESTION_PUBLICATION_PERSISTENCE_CONFLICT: HttpStatus.CONFLICT,
};

const IDENTITY_STATUS: Record<IdentityDomainError['code'], number> = {
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  INVALID_MFA_CHALLENGE: HttpStatus.UNAUTHORIZED,
  INVALID_TOTP: HttpStatus.UNAUTHORIZED,
  INVALID_REFRESH_TOKEN: HttpStatus.UNAUTHORIZED,
  AUTH_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  ACCOUNT_DISABLED: HttpStatus.FORBIDDEN,
};

const USER_MANAGEMENT_STATUS: Record<UserManagementError['code'], number> = {
  ADMIN_REQUIRED: HttpStatus.FORBIDDEN,
  INVALID_SCHOOL_EMAIL: HttpStatus.BAD_REQUEST,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  SELF_LOCKOUT_FORBIDDEN: HttpStatus.CONFLICT,
  LAST_ACTIVE_ADMIN_REQUIRED: HttpStatus.CONFLICT,
};

const AUDIT_LOG_STATUS: Record<AuditLogError['code'], number> = {
  ADMIN_REQUIRED: HttpStatus.FORBIDDEN,
  AUDIT_LOG_NOT_FOUND: HttpStatus.NOT_FOUND,
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

const LEARNING_STATUS: Record<LearningDomainError['code'], number> = {
  QUESTION_UNAVAILABLE: HttpStatus.CONFLICT,
  QUESTION_OPTION_MISMATCH: HttpStatus.CONFLICT,
  ATTEMPT_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  VOCABULARY_UNAVAILABLE: HttpStatus.NOT_FOUND,
};

const WORDBOOK_STATUS: Record<WordbookDomainError['code'], number> = {
  WORDBOOK_NAME_INVALID: HttpStatus.BAD_REQUEST,
  WORDBOOK_NOT_FOUND: HttpStatus.NOT_FOUND,
  WORDBOOK_SAME_TARGET: HttpStatus.BAD_REQUEST,
  VOCABULARY_UNAVAILABLE: HttpStatus.NOT_FOUND,
};

const MEDIA_ADMIN_STATUS: Partial<
  Record<MediaAssetDomainError['code'], number>
> = {
  MEDIA_UPLOAD_EMPTY: HttpStatus.BAD_REQUEST,
  MEDIA_UPLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  MEDIA_MIME_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  MEDIA_SHA256_INVALID: HttpStatus.BAD_REQUEST,
  MEDIA_ASSET_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEDIA_ASSET_NOT_UPLOADING: HttpStatus.CONFLICT,
  MEDIA_ASSET_NOT_READY: HttpStatus.CONFLICT,
  MEDIA_ASSET_IMMUTABLE: HttpStatus.CONFLICT,
  MEDIA_INSPECTION_MISMATCH: HttpStatus.CONFLICT,
};

const QUESTION_ADMIN_STATUS: Record<QuestionAdminError['code'], number> = {
  QUESTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUESTION_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUESTION_VERSION_MISMATCH: HttpStatus.CONFLICT,
  QUESTION_TYPE_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUESTION_TAXONOMY_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUESTION_REFERENCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUESTION_REFERENCE_MISMATCH: HttpStatus.CONFLICT,
  QUESTION_MEDIA_NOT_READY: HttpStatus.CONFLICT,
  QUESTION_CONTENT_INVALID: HttpStatus.BAD_REQUEST,
  IMMUTABLE_VERSION: HttpStatus.CONFLICT,
};

const QUESTION_TAXONOMY_STATUS: Record<
  QuestionTaxonomyError['code'],
  number
> = {
  TYPE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  TYPE_VERSION_IMMUTABLE: HttpStatus.CONFLICT,
  TYPE_VERSION_NOT_READY: HttpStatus.CONFLICT,
  INVALID_LIFECYCLE_TRANSITION: HttpStatus.CONFLICT,
  DIFFICULTY_CRITERIA_INVALID: HttpStatus.BAD_REQUEST,
  APPROVED_EXAMPLE_INVALID: HttpStatus.BAD_REQUEST,
};

const QUESTION_PUBLICATION_STATUS: Record<
  QuestionPublicationError['code'],
  number
> = {
  QUESTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUESTION_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUESTION_VERSION_MISMATCH: HttpStatus.CONFLICT,
  IMMUTABLE_VERSION: HttpStatus.CONFLICT,
  QUESTION_VERSION_NOT_PUBLISHABLE: HttpStatus.CONFLICT,
  QUESTION_STATE_CONFLICT: HttpStatus.CONFLICT,
  QUESTION_RESTORE_NOT_ALLOWED: HttpStatus.CONFLICT,
};

const VOCABULARY_ADMIN_STATUS: Record<VocabularyAdminError['code'], number> = {
  VOCABULARY_NOT_FOUND: HttpStatus.NOT_FOUND,
  VOCABULARY_DUPLICATE: HttpStatus.CONFLICT,
  VOCABULARY_IN_USE: HttpStatus.CONFLICT,
  VOCABULARY_CONTENT_INVALID: HttpStatus.BAD_REQUEST,
  VOCABULARY_MEDIA_NOT_FOUND: HttpStatus.NOT_FOUND,
  VOCABULARY_AUDIO_NOT_READY: HttpStatus.CONFLICT,
  VOCABULARY_STATE_CONFLICT: HttpStatus.CONFLICT,
};

const VOCABULARY_RELATIONS_MERGE_STATUS: Record<
  VocabularyRelationsMergeAdminError['code'],
  number
> = {
  MEANING_RELATION_DUPLICATE: HttpStatus.CONFLICT,
  MEANING_RELATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEANING_RELATION_SELF: HttpStatus.BAD_REQUEST,
  MEANING_RELATION_STATE_CONFLICT: HttpStatus.CONFLICT,
  VOCABULARY_MERGE_CONFLICT: HttpStatus.CONFLICT,
  VOCABULARY_MERGE_KIND_MISMATCH: HttpStatus.CONFLICT,
  VOCABULARY_MERGE_REPRESENTATIVE_INVALID: HttpStatus.CONFLICT,
  VOCABULARY_MERGE_SAME_TARGET: HttpStatus.BAD_REQUEST,
  VOCABULARY_MERGE_SOURCE_INVALID: HttpStatus.CONFLICT,
  VOCABULARY_NOT_FOUND: HttpStatus.NOT_FOUND,
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

  if (error instanceof EmailChallengeError) {
    const status = EMAIL_CHALLENGE_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof UserManagementError) {
    const status = USER_MANAGEMENT_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof AuditLogError) {
    const status = AUDIT_LOG_STATUS[error.code];
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

  if (error instanceof ContentImportError) {
    const status = HttpStatus.CONFLICT;
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof MediaAssetDomainError) {
    const status = MEDIA_ADMIN_STATUS[error.code];
    if (status !== undefined) {
      return {
        status,
        body: createProblem(error.code, status, requestId),
      };
    }
  }

  if (error instanceof QuestionAdminError) {
    const status = QUESTION_ADMIN_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof QuestionPublicationError) {
    const status = QUESTION_PUBLICATION_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }
  if (error instanceof QuestionTaxonomyError) {
    const status =
      QUESTION_TAXONOMY_STATUS[error.code] ?? INTERNAL_SERVER_ERROR_STATUS;
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof VocabularyAdminError) {
    const status = VOCABULARY_ADMIN_STATUS[error.code];
    return {
      status,
      body: createProblem(error.code, status, requestId),
    };
  }

  if (error instanceof VocabularyRelationsMergeAdminError) {
    const status = VOCABULARY_RELATIONS_MERGE_STATUS[error.code];
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

type ErrorRequest = AdminRequestIdRequest & {
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
    const requestId = resolveAdminRequestId(request);
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

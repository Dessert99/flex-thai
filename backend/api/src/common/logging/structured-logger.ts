/** CloudWatch가 검색할 수 있는 JSON 로그에서 민감 정보를 제거한다 */
import type { LoggerService } from '@nestjs/common';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'email',
  'phonenumber',
  'otp',
  'totp',
  'password',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'linktoken',
  'rawjson',
  'storagekey',
]);
const SENSITIVE_KEY_PARTS = new Set([
  'authorization',
  'cookie',
  'email',
  'otp',
  'password',
  'secret',
  'token',
  'totp',
]);

type LogMetadata = Record<string, unknown>;
type LogWriter = (line: string) => void;

const isPlainRecord = (value: unknown): value is LogMetadata => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isSensitiveKey = (key: string): boolean => {
  const parts = key
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
  return (
    SENSITIVE_KEYS.has(parts.join('')) ||
    parts.some((part) => SENSITIVE_KEY_PARTS.has(part))
  );
};

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (value instanceof Error) {
    return { name: value.name };
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveKey(key))
        .map(([key, child]) => [key, sanitize(child)]),
    );
  }

  return value;
};

const isStackTrace = (value: string): boolean => /\n\s+at\s/u.test(value);

const normalizeOptionalParameters = (
  optionalParams: unknown[],
  discardFirstStack = false,
) => {
  const metadata: LogMetadata = {};
  let context: string | undefined;
  let errorName: string | undefined;

  for (const [index, optionalParam] of optionalParams.entries()) {
    if (isPlainRecord(optionalParam)) {
      Object.assign(metadata, optionalParam);
      continue;
    }
    if (typeof optionalParam === 'string') {
      if (discardFirstStack && index === 0 && isStackTrace(optionalParam)) {
        continue;
      }
      // Nest는 마지막 문자열을 context로 전달한다.
      context = optionalParam;
      continue;
    }
    if (optionalParam instanceof Error) {
      errorName = optionalParam.name;
    }
  }

  return { context, errorName, metadata };
};

/** service와 요청 식별자를 가진 한 줄 JSON logger */
export class StructuredLogger implements LoggerService {
  constructor(
    private readonly service: string,
    private readonly write: LogWriter = console.log,
  ) {}

  /** 일반 동작 로그를 JSON 한 줄로 기록한다 */
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('info', message, optionalParams);
  }

  /** 오류 name과 안전한 context만 JSON 한 줄로 기록한다 */
  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, optionalParams, true);
  }

  /** 복구 가능한 경고를 JSON 한 줄로 기록한다 */
  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  /** 개발 진단 정보를 JSON 한 줄로 기록한다 */
  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  /** 상세 진단 정보를 JSON 한 줄로 기록한다 */
  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('verbose', message, optionalParams);
  }

  /** 프로세스 지속이 어려운 오류를 JSON 한 줄로 기록한다 */
  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('fatal', message, optionalParams);
  }

  private emit(
    level: string,
    message: unknown,
    optionalParams: unknown[],
    discardFirstStack = false,
  ): void {
    const {
      context,
      errorName: optionalErrorName,
      metadata,
    } = normalizeOptionalParameters(optionalParams, discardFirstStack);
    const messageErrorName =
      message instanceof Error ? message.name : undefined;
    const errorName = messageErrorName ?? optionalErrorName;
    this.write(
      JSON.stringify(
        sanitize({
          ...metadata,
          ...(context === undefined ? {} : { context }),
          ...(errorName === undefined ? {} : { errorName }),
          level,
          service: this.service,
          ...(message instanceof Error ? {} : { message: String(message) }),
        }),
      ),
    );
  }
}

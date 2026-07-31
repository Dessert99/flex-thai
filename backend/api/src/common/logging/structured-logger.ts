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
  'token',
  'accesstoken',
  'refreshtoken',
  'linktoken',
  'rawjson',
  'storagekey',
]);

type LogMetadata = Record<string, unknown>;
type LogWriter = (line: string) => void;

const isPlainRecord = (value: unknown): value is LogMetadata => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
        .map(([key, child]) => [key, sanitize(child)]),
    );
  }

  return value;
};

const normalizeOptionalParameters = (optionalParams: unknown[]) => {
  const metadata: LogMetadata = {};
  let context: string | undefined;
  let errorName: string | undefined;

  for (const optionalParam of optionalParams) {
    if (isPlainRecord(optionalParam)) {
      Object.assign(metadata, optionalParam);
      continue;
    }
    if (typeof optionalParam === 'string') {
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
    this.emit('error', message, optionalParams);
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
  ): void {
    const { context, errorName, metadata } =
      normalizeOptionalParameters(optionalParams);
    this.write(
      JSON.stringify(
        sanitize({
          ...metadata,
          ...(context === undefined ? {} : { context }),
          ...(errorName === undefined ? {} : { errorName }),
          level,
          service: this.service,
          message: String(message),
        }),
      ),
    );
  }
}

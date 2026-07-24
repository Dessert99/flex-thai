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

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
        .map(([key, child]) => [key, sanitize(child)]),
    );
  }

  return value;
};

/** service와 요청 식별자를 가진 한 줄 JSON logger */
export class StructuredLogger implements LoggerService {
  constructor(
    private readonly service: string,
    private readonly write: LogWriter = console.log,
  ) {}

  /** 일반 동작 로그를 JSON 한 줄로 기록한다 */
  log(message: unknown, metadata?: LogMetadata): void {
    this.emit('info', message, metadata);
  }

  /** 오류 code와 안전한 context만 JSON 한 줄로 기록한다 */
  error(message: unknown, metadata?: LogMetadata): void {
    this.emit('error', message, metadata);
  }

  /** 복구 가능한 경고를 JSON 한 줄로 기록한다 */
  warn(message: unknown, metadata?: LogMetadata): void {
    this.emit('warn', message, metadata);
  }

  /** 개발 진단 정보를 JSON 한 줄로 기록한다 */
  debug(message: unknown, metadata?: LogMetadata): void {
    this.emit('debug', message, metadata);
  }

  /** 상세 진단 정보를 JSON 한 줄로 기록한다 */
  verbose(message: unknown, metadata?: LogMetadata): void {
    this.emit('verbose', message, metadata);
  }

  /** 프로세스 지속이 어려운 오류를 JSON 한 줄로 기록한다 */
  fatal(message: unknown, metadata?: LogMetadata): void {
    this.emit('fatal', message, metadata);
  }

  private emit(
    level: string,
    message: unknown,
    metadata: LogMetadata = {},
  ): void {
    this.write(
      JSON.stringify(
        sanitize({
          level,
          service: this.service,
          message: String(message),
          ...metadata,
        }),
      ),
    );
  }
}

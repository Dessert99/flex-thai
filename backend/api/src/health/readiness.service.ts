/** Aurora 연결 가능 여부만 liveness와 분리해 확인한다 */
import {
  Controller,
  Get,
  Injectable,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';

/** local PostgreSQL과 Aurora Data API가 구현할 최소 준비 확인 port */
export interface ReadinessProbe {
  check(): Promise<void>;
}

/** Aurora가 auto-pause에서 재개 중임을 나타내는 안정적인 오류 */
export class ReadinessError extends Error {
  readonly code = 'DB_RESUMING';

  constructor() {
    super('DB_RESUMING');
    this.name = 'ReadinessError';
  }
}

/** DB probe를 최대 대기 시간 안에서만 실행한다 */
@Injectable()
export class ReadinessService {
  constructor(
    private readonly probe: ReadinessProbe,
    private readonly timeoutMs = 25_000,
  ) {}

  /** DB가 응답할 때만 ready 상태를 반환한다 */
  async check(): Promise<{ status: 'ready' }> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        this.probe.check(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new ReadinessError()),
            this.timeoutMs,
          );
        }),
      ]);
      return { status: 'ready' };
    } catch {
      throw new ReadinessError();
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

/** 배포와 알람에서 DB 준비 상태만 확인하는 endpoint */
@Controller('ready')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  /** DB 재개 중이면 3초 뒤 재시도할 503 응답을 반환한다 */
  @Get()
  async getReady(
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<{ status: 'ready' }> {
    try {
      return await this.readiness.check();
    } catch {
      response.setHeader('Retry-After', '3');
      throw new ServiceUnavailableException({ code: 'DB_RESUMING' });
    }
  }
}

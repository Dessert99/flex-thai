/** 운영 중 바뀐 이메일 발송 상한을 Parameter Store에서 읽는다 */
import { GetParametersCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type {
  ChallengeLimitProvider,
  ChallengeLimits,
} from '@flex-thia/domain';

const suffixes = {
  cooldownSeconds: 'challenge-cooldown-seconds',
  perEmailPerDay: 'challenge-email-daily-limit',
  globalPerDay: 'challenge-global-daily-limit',
} as const;

/** SSM 호출량을 줄이면서 60초 안에 상한 변경을 반영한다 */
export class SsmChallengeLimitProvider implements ChallengeLimitProvider {
  private cached: { value: ChallengeLimits; expiresAt: number } | null = null;

  constructor(
    private readonly client: SSMClient,
    private readonly prefix: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** 누락·잘못된 값은 방어가 꺼지지 않도록 오류로 중단한다 */
  async getLimits(): Promise<ChallengeLimits> {
    if (this.cached && this.cached.expiresAt > this.now()) {
      return this.cached.value;
    }
    const names = Object.values(suffixes).map(
      (suffix) => `${this.prefix}/${suffix}`,
    );
    const result = await this.client.send(
      new GetParametersCommand({ Names: names }),
    );
    const values = new Map(
      result.Parameters?.map((parameter) => [parameter.Name, parameter.Value]),
    );
    const read = (suffix: string): number => {
      const value = Number(values.get(`${this.prefix}/${suffix}`));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`인증 상한 Parameter가 잘못되었습니다: ${suffix}`);
      }
      return value;
    };
    const limits = {
      cooldownSeconds: read(suffixes.cooldownSeconds),
      perEmailPerDay: read(suffixes.perEmailPerDay),
      globalPerDay: read(suffixes.globalPerDay),
    };
    this.cached = { value: limits, expiresAt: this.now() + 60_000 };
    return limits;
  }
}

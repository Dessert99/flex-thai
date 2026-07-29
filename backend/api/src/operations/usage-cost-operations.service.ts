/** 사용량 query와 비용 설정을 관리자 공개 응답으로 조립한다 */
import { createHash } from 'node:crypto';

/** API가 허용하는 provider run filter */
export interface UsageCostOverviewQueryInput {
  from?: string;
  to?: string;
  source?: 'AI' | 'TTS';
  provider?: string;
  model?: string;
  voice?: string;
  status?: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'OUTCOME_UNKNOWN';
}

/** DB read adapter가 쓰는 UTC 기간 */
export interface UsageCostDateRangeInput {
  from: Date;
  to: Date;
}

/** API가 노출해도 되는 provider/model/voice 비용 행 */
export interface UsageCostBreakdownInput {
  source: 'AI' | 'TTS';
  provider: string;
  model: string;
  voice: string | null;
  runCount: number;
  estimatedCostUsd: string;
}

/** DB query의 안전한 overview 결과 */
export interface UsageCostOverviewReadResult {
  estimatedCostUsd: string;
  inProgressJobCount: number;
  failedRunCount: number;
  pendingReviewCandidateCount: number;
  breakdown: UsageCostBreakdownInput[];
}

/** API service가 요구하는 읽기 adapter */
export interface UsageCostOperationsQueryPort {
  getOverview(input: {
    range: UsageCostDateRangeInput;
    source?: 'AI' | 'TTS';
    provider?: string;
    model?: string;
    voice?: string;
    status?: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'OUTCOME_UNKNOWN';
  }): Promise<UsageCostOverviewReadResult>;
  getCurrentMonthEstimatedCost(range: UsageCostDateRangeInput): Promise<string>;
}

/** 비용 경고 singleton의 안전한 저장 projection */
export interface OperationsCostSettingsInput {
  currency: 'USD';
  warningUsd: string;
  criticalUsd: string;
  updatedAt: Date;
}

/** settings repository의 optimistic update 입력 */
export interface UpdateOperationsCostSettingsCommand {
  warningUsd: string;
  criticalUsd: string;
  expectedUpdatedAt: Date;
  requestId: string;
  requestFingerprint: string;
  actor: { userId: string; sub: string };
  changedAt: Date;
}

/** API service가 요구하는 settings 저장 adapter */
export interface OperationsCostSettingsRepositoryPort {
  find(): Promise<OperationsCostSettingsInput>;
  update(
    input: UpdateOperationsCostSettingsCommand,
  ): Promise<
    | { kind: 'UPDATED'; settings: OperationsCostSettingsInput }
    | { kind: 'REPLAY'; settings: OperationsCostSettingsInput }
    | { kind: 'CONFLICT' }
  >;
}

/** overview의 공개 응답 형태 */
export interface UsageCostOverviewResult extends UsageCostOverviewReadResult {
  range: { from: string; to: string };
  currentMonthThreshold: {
    range: { from: string; to: string };
    estimatedCostUsd: string;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  };
}

/** settings의 공개 응답 형태 */
export interface OperationsCostSettingsResult {
  currency: 'USD';
  warningUsd: string;
  criticalUsd: string;
  updatedAt: string;
}

/** 비용 운영 API가 안정적으로 전달하는 오류 code */
export class UsageCostOperationsError extends Error {
  constructor(
    readonly code:
      | 'ADMIN_REQUIRED'
      | 'USAGE_COST_RANGE_INVALID'
      | 'OPERATIONS_COST_SETTINGS_CONFLICT',
  ) {
    super(code);
    this.name = 'UsageCostOperationsError';
  }
}

/** 사용량·비용 API 조립에 필요한 adapter와 현재 시각 */
export interface UsageCostOperationsServiceDependencies {
  query: UsageCostOperationsQueryPort;
  settings: OperationsCostSettingsRepositoryPort;
  now?: () => Date;
}

const toUsdSubunits = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(8, '0')}`);
};

const toIsoRange = (range: UsageCostDateRangeInput) => ({
  from: range.from.toISOString(),
  to: range.to.toISOString(),
});

const sameRange = (
  left: UsageCostDateRangeInput,
  right: UsageCostDateRangeInput,
): boolean =>
  left.from.getTime() === right.from.getTime() &&
  left.to.getTime() === right.to.getTime();

const currentUtcMonth = (now: Date): UsageCostDateRangeInput => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1)),
    to: new Date(Date.UTC(year, month + 1, 1)),
  };
};

const resolveRange = (
  query: UsageCostOverviewQueryInput,
  now: Date,
): UsageCostDateRangeInput => {
  if (query.from === undefined && query.to === undefined) {
    return currentUtcMonth(now);
  }
  if (query.from === undefined || query.to === undefined) {
    throw new UsageCostOperationsError('USAGE_COST_RANGE_INVALID');
  }
  const range = { from: new Date(query.from), to: new Date(query.to) };
  if (
    Number.isNaN(range.from.getTime()) ||
    Number.isNaN(range.to.getTime()) ||
    range.from.getTime() >= range.to.getTime()
  ) {
    throw new UsageCostOperationsError('USAGE_COST_RANGE_INVALID');
  }
  return range;
};

const assertAdmin = (actor: { role: 'ADMIN' | 'LEARNER' }): void => {
  if (actor.role !== 'ADMIN') {
    throw new UsageCostOperationsError('ADMIN_REQUIRED');
  }
};

const toSettingsResult = (
  settings: OperationsCostSettingsInput,
): OperationsCostSettingsResult => ({
  currency: 'USD',
  warningUsd: settings.warningUsd,
  criticalUsd: settings.criticalUsd,
  updatedAt: settings.updatedAt.toISOString(),
});

const thresholdStatus = (
  estimatedCostUsd: string,
  settings: OperationsCostSettingsInput,
): 'NORMAL' | 'WARNING' | 'CRITICAL' => {
  const cost = toUsdSubunits(estimatedCostUsd);
  if (cost >= toUsdSubunits(settings.criticalUsd)) return 'CRITICAL';
  if (cost >= toUsdSubunits(settings.warningUsd)) return 'WARNING';
  return 'NORMAL';
};

const hasProviderRunFilter = (query: UsageCostOverviewQueryInput): boolean =>
  query.source !== undefined ||
  query.provider !== undefined ||
  query.model !== undefined ||
  query.voice !== undefined ||
  query.status !== undefined;

const requestFingerprint = (input: {
  warningUsd: string;
  criticalUsd: string;
  expectedUpdatedAt: string;
  requestId: string;
}): string =>
  createHash('sha256')
    .update(
      `${input.warningUsd}|${input.criticalUsd}|${input.expectedUpdatedAt}|${input.requestId}`,
    )
    .digest('hex');

/** 사용량 query와 비용 경고 설정을 ADMIN 공개 결과로 조립한다 */
export class UsageCostOperationsService {
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: UsageCostOperationsServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** 기간별 overview와 현재 UTC 월 threshold를 함께 반환한다 */
  async overview(
    actor: { role: 'ADMIN' | 'LEARNER' },
    query: UsageCostOverviewQueryInput,
  ): Promise<UsageCostOverviewResult> {
    assertAdmin(actor);
    const now = this.now();
    const range = resolveRange(query, now);
    const monthRange = currentUtcMonth(now);
    const [overview, settings, selectedMonthCost] = await Promise.all([
      this.dependencies.query.getOverview({
        range,
        ...(query.source ? { source: query.source } : {}),
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.model ? { model: query.model } : {}),
        ...(query.voice ? { voice: query.voice } : {}),
        ...(query.status ? { status: query.status } : {}),
      }),
      this.dependencies.settings.find(),
      sameRange(range, monthRange) && !hasProviderRunFilter(query)
        ? Promise.resolve(undefined)
        : this.dependencies.query.getCurrentMonthEstimatedCost(monthRange),
    ]);
    const thresholdCost = selectedMonthCost ?? overview.estimatedCostUsd;
    return {
      ...overview,
      range: toIsoRange(range),
      currentMonthThreshold: {
        range: toIsoRange(monthRange),
        estimatedCostUsd: thresholdCost,
        status: thresholdStatus(thresholdCost, settings),
      },
    };
  }

  /** ADMIN에게 현재 비용 경고 설정을 반환한다 */
  async settings(actor: {
    role: 'ADMIN' | 'LEARNER';
  }): Promise<OperationsCostSettingsResult> {
    assertAdmin(actor);
    return toSettingsResult(await this.dependencies.settings.find());
  }

  /** optimistic request로 비용 경고 설정을 변경한다 */
  async updateSettings(
    actor: { role: 'ADMIN' | 'LEARNER'; userId: string; sub: string },
    input: {
      warningUsd: string;
      criticalUsd: string;
      expectedUpdatedAt: string;
      requestId: string;
    },
  ): Promise<OperationsCostSettingsResult> {
    assertAdmin(actor);
    const changedAt = this.now();
    const result = await this.dependencies.settings.update({
      warningUsd: input.warningUsd,
      criticalUsd: input.criticalUsd,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      requestId: input.requestId,
      requestFingerprint: requestFingerprint(input),
      actor: { userId: actor.userId, sub: actor.sub },
      changedAt,
    });
    if (result.kind === 'CONFLICT') {
      throw new UsageCostOperationsError('OPERATIONS_COST_SETTINGS_CONFLICT');
    }
    return toSettingsResult(result.settings);
  }
}

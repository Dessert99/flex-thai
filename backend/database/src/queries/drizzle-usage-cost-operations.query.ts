/** AI·TTS provider 실행을 하나의 읽기 모델로 정규화해 비용을 집계한다 */
import { sql, type SQL } from 'drizzle-orm';

/** provider run을 읽을 UTC half-open 기간 */
export interface UsageCostDateRange {
  from: Date;
  to: Date;
}

/** overview의 선택적 provider run filter */
export interface UsageCostOverviewReadInput {
  range: UsageCostDateRange;
  source?: 'AI' | 'TTS';
  provider?: string;
  model?: string;
  voice?: string;
  status?: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'OUTCOME_UNKNOWN';
}

/** provider/model/voice 단위의 비용 aggregate */
export interface UsageCostBreakdown {
  source: 'AI' | 'TTS';
  provider: string;
  model: string;
  voice: string | null;
  runCount: number;
  estimatedCostUsd: string;
}

/** 운영 화면이 소비하는 안전한 읽기 모델 */
export interface UsageCostOverviewReadModel {
  estimatedCostUsd: string;
  inProgressJobCount: number;
  failedRunCount: number;
  pendingReviewCandidateCount: number;
  breakdown: UsageCostBreakdown[];
}

/** API가 의존하는 사용량·비용 read port */
export interface UsageCostOperationsQuery {
  getOverview(
    input: UsageCostOverviewReadInput,
  ): Promise<UsageCostOverviewReadModel>;
  getCurrentMonthEstimatedCost(range: UsageCostDateRange): Promise<string>;
}

interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

const normalizedRuns = sql`
  with normalized_provider_runs as (
    select
      'AI'::text as source,
      provider_runs.provider,
      provider_runs.model,
      null::text as voice,
      provider_runs.status::text as status,
      provider_runs.estimated_cost_usd as estimated_cost_usd,
      provider_runs.started_at,
      provider_runs.finished_at
    from provider_runs
    union all
    select
      'TTS'::text as source,
      tts_provider_runs.provider,
      tts_provider_runs.model,
      tts_items.voice_snapshot ->> 'voice' as voice,
      tts_provider_runs.status::text as status,
      coalesce(tts_provider_runs.estimated_cost_usd, 0) as estimated_cost_usd,
      tts_provider_runs.started_at,
      tts_provider_runs.finished_at
    from tts_provider_runs
    inner join tts_items on tts_items.id = tts_provider_runs.item_id
    inner join tts_jobs on tts_jobs.id = tts_items.job_id
  )
`;

const rowsOf = (result: unknown): unknown[] => {
  if (Array.isArray(result)) return result;
  if (
    result !== null &&
    typeof result === 'object' &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows;
  }
  throw new Error('USAGE_COST_QUERY_RESULT_INVALID');
};

const readString = (row: unknown, key: string): string => {
  if (row === null || typeof row !== 'object') return '0';
  const value = (row as Record<string, unknown>)[key];
  if (value === null || value === undefined) return '0';
  if (typeof value === 'string' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  throw new Error('USAGE_COST_ROW_VALUE_INVALID');
};

const readCount = (row: unknown, key: string): number =>
  Number(readString(row, key));

const isSource = (value: string): value is UsageCostBreakdown['source'] =>
  value === 'AI' || value === 'TTS';

const toBreakdown = (row: unknown): UsageCostBreakdown => {
  const source = readString(row, 'source');
  if (!isSource(source)) throw new Error('USAGE_COST_SOURCE_INVALID');
  const record = row as Record<string, unknown>;
  return {
    source,
    provider: readString(row, 'provider'),
    model: readString(row, 'model'),
    voice: record.voice === null ? null : readString(row, 'voice'),
    runCount: readCount(row, 'run_count'),
    estimatedCostUsd: readString(row, 'estimated_cost_usd'),
  };
};

const runConditions = (
  input: UsageCostOverviewReadInput,
  options: { includeStatus: boolean },
): SQL => {
  const conditions: SQL[] = [
    sql`((status = 'STARTED' and started_at >= ${input.range.from} and started_at < ${input.range.to}) or (status <> 'STARTED' and finished_at >= ${input.range.from} and finished_at < ${input.range.to}))`,
    ...(input.source ? [sql`source = ${input.source}`] : []),
    ...(input.provider ? [sql`provider = ${input.provider}`] : []),
    ...(input.model ? [sql`model = ${input.model}`] : []),
    ...(input.voice ? [sql`voice = ${input.voice}`] : []),
    ...(input.status && options.includeStatus
      ? [sql`status = ${input.status}`]
      : []),
  ];
  return sql.join(conditions, sql` and `);
};

const currentMonthCostConditions = (range: UsageCostDateRange): SQL =>
  sql`((status = 'STARTED' and started_at >= ${range.from} and started_at < ${range.to}) or (status <> 'STARTED' and finished_at >= ${range.from} and finished_at < ${range.to}))`;

/** AI·TTS 비용 breakdown과 운영 aggregate를 변경 없이 읽는다 */
export class DrizzleUsageCostOperationsQuery implements UsageCostOperationsQuery {
  constructor(private readonly database: SqlExecutor) {}

  /** 선택한 기간·filter의 비용과 운영 상태를 함께 반환한다 */
  async getOverview(
    input: UsageCostOverviewReadInput,
  ): Promise<UsageCostOverviewReadModel> {
    const selectedConditions = runConditions(input, { includeStatus: true });
    const failedConditions = runConditions(input, { includeStatus: false });
    const [
      costResult,
      breakdownResult,
      inProgressResult,
      failedResult,
      pendingResult,
    ] = await Promise.all([
      this.database.execute(sql`${normalizedRuns}
          select coalesce(sum(estimated_cost_usd), 0)::text as estimated_cost_usd
          from normalized_provider_runs where ${selectedConditions}`),
      this.database.execute(sql`${normalizedRuns}
          select source, provider, model, voice, count(*)::int as run_count,
            coalesce(sum(estimated_cost_usd), 0)::text as estimated_cost_usd
          from normalized_provider_runs where ${selectedConditions}
          group by source, provider, model, voice
          order by source, provider, model, voice nulls first`),
      this.database.execute(sql`
          select (
            (select count(*) from jobs where status in ('QUEUED', 'RUNNING')
              and created_at >= ${input.range.from} and created_at < ${input.range.to}) +
            (select count(*) from tts_jobs where status in ('QUEUED', 'RUNNING')
              and created_at >= ${input.range.from} and created_at < ${input.range.to})
          )::int as in_progress_job_count`),
      this.database.execute(sql`${normalizedRuns}
          select count(*)::int as failed_run_count
          from normalized_provider_runs
          where ${failedConditions} and status = 'FAILED'`),
      this.database.execute(sql`
          select count(*)::int as pending_review_candidate_count
          from question_production_candidates
          where review_status = 'PENDING'
            and created_at >= ${input.range.from} and created_at < ${input.range.to}`),
    ]);
    const [cost] = rowsOf(costResult);
    const [inProgress] = rowsOf(inProgressResult);
    const [failed] = rowsOf(failedResult);
    const [pending] = rowsOf(pendingResult);
    return {
      estimatedCostUsd: readString(cost, 'estimated_cost_usd'),
      inProgressJobCount: readCount(inProgress, 'in_progress_job_count'),
      failedRunCount: readCount(failed, 'failed_run_count'),
      pendingReviewCandidateCount: readCount(
        pending,
        'pending_review_candidate_count',
      ),
      breakdown: rowsOf(breakdownResult).map(toBreakdown),
    };
  }

  /** warning 판단용 현재 UTC 월 비용을 provider filter 없이 읽는다 */
  async getCurrentMonthEstimatedCost(
    range: UsageCostDateRange,
  ): Promise<string> {
    const result = await this.database.execute(sql`${normalizedRuns}
      select coalesce(sum(estimated_cost_usd), 0)::text as estimated_cost_usd
      from normalized_provider_runs where ${currentMonthCostConditions(range)}`);
    const [row] = rowsOf(result);
    return readString(row, 'estimated_cost_usd');
  }
}

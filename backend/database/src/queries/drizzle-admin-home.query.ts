/** 관리자 홈의 전체 운영 상태를 페이지 표본 없이 집계한다 */
import { sql, type SQL } from 'drizzle-orm';

interface AdminHomeReadDatabase {
  execute(query: SQL): Promise<unknown>;
}

/** 관리자 홈 전용 안전한 운영 집계 */
export interface AdminHomeOperationsProjection {
  pendingErrorReportCount: number;
  recentVerificationAt: Date | null;
}

type AggregateRow = {
  pendingErrorReportCount?: number | string;
  recentVerificationAt?: Date | string | null;
};

const operationsSummaryQuery = (userId: string) => sql`
  select
    (select count(*) from content_error_reports where status in ('OPEN', 'IN_PROGRESS')) as "pendingErrorReportCount",

    (
      select created_at
      from step_up_grants
      where user_id = ${userId}
      order by created_at desc
      limit 1
    ) as "recentVerificationAt"
`;

const rowsOf = <Row>(result: unknown): Row[] => {
  if (Array.isArray(result)) return result as Row[];
  if (
    result !== null &&
    typeof result === 'object' &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as Row[];
  }
  return [];
};

const count = (value: number | string | undefined): number =>
  Number(value ?? 0);
const date = (value: Date | string | null | undefined): Date | null =>
  value instanceof Date ? value : value ? new Date(value) : null;

/** 전체 운영 테이블을 한 시점의 scalar 집계로 읽는다 */
export class DrizzleAdminHomeQuery {
  constructor(private readonly database: AdminHomeReadDatabase) {}

  /** 미처리·실행·실패 상태를 전체 행 기준으로 반환한다 */
  async getOperationsSummary(
    userId: string,
  ): Promise<AdminHomeOperationsProjection> {
    const [row] = rowsOf<AggregateRow>(
      await this.database.execute(operationsSummaryQuery(userId)),
    );

    return {
      pendingErrorReportCount: count(row?.pendingErrorReportCount),
      recentVerificationAt: date(row?.recentVerificationAt),
    };
  }
}

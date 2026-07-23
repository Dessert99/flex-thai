/** PostgreSQL과 Aurora Data API에 같은 최소 readiness query를 실행한다 */
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from '../schema/index.js';

type ReadinessDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** DB가 명령을 받을 수 있는지 select 1만 실행해 확인한다 */
export class DrizzleReadinessProbe {
  constructor(private readonly database: ReadinessDatabase) {}

  /** schema나 사용자 데이터를 읽지 않는 최소 query를 실행한다 */
  async check(): Promise<void> {
    await this.database.execute(sql`select 1`);
  }
}

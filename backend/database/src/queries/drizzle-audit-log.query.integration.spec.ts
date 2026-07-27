/** 실제 PostgreSQL에서 감사 검색·actor·tie-break·read-only 성질을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../schema/index.js';
import { DrizzleAuditLogQuery } from './drizzle-audit-log.query.js';

const databaseUrl = process.env.USER_AUDIT_TEST_DATABASE_URL;

describe.runIf(databaseUrl !== undefined)(
  'DrizzleAuditLogQuery PostgreSQL',
  () => {
    let pool: Pool;
    let query: DrizzleAuditLogQuery;

    beforeAll(() => {
      if (!databaseUrl)
        throw new Error('USER_AUDIT_TEST_DATABASE_URL_REQUIRED');
      pool = new Pool({ connectionString: databaseUrl });
      query = new DrizzleAuditLogQuery(drizzle(pool, { schema }));
    });

    beforeEach(async () => {
      await pool.query('truncate table audit_logs, users cascade');
    });

    afterAll(async () => {
      await pool.end();
    });

    it('USER/SYSTEM actor와 nullable target을 조합 filter로 stable 조회한다', async () => {
      const userId = randomUUID();
      const firstAuditId = randomUUID();
      const secondAuditId = randomUUID();
      const createdAt = new Date('2026-07-26T00:00:00.000Z');
      await pool.query(
        `insert into users (id, cognito_sub, email, role)
         values ($1, $2, 'admin@hufs.ac.kr', 'ADMIN')`,
        [userId, `sub-${userId}`],
      );
      await pool.query(
        `insert into audit_logs (
           id, actor_sub, actor_user_id, action, target, target_type,
           target_id, summary, request_id, created_at
         ) values
           ($1, $8, $3, 'IDENTITY_USER_DISABLED', $4, 'USER', $3, '{}', $5, $7),
           ($2, 'migration', null, 'MIGRATED', 'legacy', null, null, '{"count":1}', $6, $7)`,
        [
          firstAuditId,
          secondAuditId,
          userId,
          `users/${userId}`,
          randomUUID(),
          randomUUID(),
          createdAt,
          `sub-${userId}`,
        ],
      );
      const before = await auditCount(pool);

      const userPage = await query.list({
        query: 'admin',
        actorUserId: userId,
        action: 'IDENTITY_USER_DISABLED',
        targetType: 'USER',
        targetId: userId,
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-31T00:00:00.000Z'),
        page: 1,
        pageSize: 20,
      });
      const systemDetail = await query.findById(secondAuditId);

      expect(userPage.items[0]?.actor).toEqual({
        kind: 'USER',
        userId,
        email: 'admin@hufs.ac.kr',
      });
      expect(systemDetail).toMatchObject({
        actor: { kind: 'SYSTEM', label: 'migration' },
        targetType: null,
        targetId: null,
        summary: { count: 1 },
      });
      expect(await auditCount(pool)).toBe(before);

      const all = await query.list({ page: 1, pageSize: 20 });
      expect(all.items.map(({ id }) => id)).toEqual(
        [firstAuditId, secondAuditId].sort().reverse(),
      );
    });
  },
);

const auditCount = async (pool: Pool) => {
  const result = await pool.query<{ count: string }>(
    'select count(*) from audit_logs',
  );
  return Number(result.rows[0]?.count);
};

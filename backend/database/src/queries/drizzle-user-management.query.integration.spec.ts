/** 실제 PostgreSQL에서 관리자 보존 lock·no-op·audit rollback을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../schema/index.js';
import { DrizzleUserManagementQuery } from './drizzle-user-management.query.js';

const databaseUrl = process.env.USER_AUDIT_TEST_DATABASE_URL;

describe.runIf(databaseUrl !== undefined)(
  'DrizzleUserManagementQuery PostgreSQL',
  () => {
    let pool: Pool;
    let query: DrizzleUserManagementQuery;

    beforeAll(() => {
      if (!databaseUrl)
        throw new Error('USER_AUDIT_TEST_DATABASE_URL_REQUIRED');
      pool = new Pool({ connectionString: databaseUrl });
      query = new DrizzleUserManagementQuery(drizzle(pool, { schema }));
    });

    beforeEach(async () => {
      await pool.query('truncate table audit_logs, users cascade');
    });

    afterAll(async () => {
      await pool.end();
    });

    it('교차 disable/demote가 동시에 와도 active admin을 한 명 보존한다', async () => {
      const firstId = randomUUID();
      const secondId = randomUUID();
      await insertUser(pool, firstId, 'ADMIN');
      await insertUser(pool, secondId, 'ADMIN');

      const results = await Promise.all([
        query.changeStatusWithAudit({
          actorSub: `sub-${secondId}`,
          actorUserId: secondId,
          occurredAt: new Date(),
          requestId: randomUUID(),
          status: 'DISABLED',
          userId: firstId,
        }),
        query.changeRoleWithAudit({
          actorSub: `sub-${firstId}`,
          actorUserId: firstId,
          occurredAt: new Date(),
          requestId: randomUUID(),
          role: 'LEARNER',
          userId: secondId,
        }),
      ]);

      expect(results.map(({ kind }) => kind).sort()).toEqual([
        'ACTOR_FORBIDDEN',
        'UPDATED',
      ]);
      const activeAdmins = await pool.query<{ count: string }>(
        `select count(*) from users where role = 'ADMIN' and status = 'ACTIVE'`,
      );
      expect(Number(activeAdmins.rows[0]?.count)).toBe(1);
    });

    it('동일값 변경은 updated_at과 audit count를 보존한다', async () => {
      const userId = randomUUID();
      await insertUser(pool, userId, 'ADMIN');
      const before = await pool.query<{ updated_at: Date }>(
        'select updated_at from users where id = $1',
        [userId],
      );

      await expect(
        query.changeRoleWithAudit({
          actorSub: `sub-${userId}`,
          actorUserId: userId,
          occurredAt: new Date(),
          requestId: randomUUID(),
          role: 'ADMIN',
          userId,
        }),
      ).resolves.toMatchObject({ kind: 'UNCHANGED' });

      const after = await pool.query<{ updated_at: Date }>(
        'select updated_at from users where id = $1',
        [userId],
      );
      const audits = await pool.query<{ count: string }>(
        'select count(*) from audit_logs',
      );
      expect(after.rows[0]?.updated_at).toEqual(before.rows[0]?.updated_at);
      expect(Number(audits.rows[0]?.count)).toBe(0);
    });

    it('audit insert 실패는 사용자 update도 rollback한다', async () => {
      const adminId = randomUUID();
      const learnerId = randomUUID();
      await insertUser(pool, adminId, 'ADMIN');
      await insertUser(pool, learnerId, 'LEARNER');
      await pool.query(`
        create function reject_user_audit() returns trigger language plpgsql as $$
        begin
          if new.action = 'IDENTITY_USER_DISABLED' then
            raise exception 'audit rejected';
          end if;
          return new;
        end $$;
        create trigger reject_user_audit before insert on audit_logs
        for each row execute function reject_user_audit();
      `);

      try {
        await expect(
          query.changeStatusWithAudit({
            actorSub: `sub-${adminId}`,
            actorUserId: adminId,
            occurredAt: new Date(),
            requestId: randomUUID(),
            status: 'DISABLED',
            userId: learnerId,
          }),
        ).rejects.toThrow();
        const learner = await pool.query<{ status: string }>(
          'select status from users where id = $1',
          [learnerId],
        );
        expect(learner.rows[0]?.status).toBe('ACTIVE');
      } finally {
        await pool.query('drop trigger reject_user_audit on audit_logs');
        await pool.query('drop function reject_user_audit()');
      }
    });
  },
);

const insertUser = async (
  pool: Pool,
  id: string,
  role: 'LEARNER' | 'ADMIN',
) => {
  await pool.query(
    `insert into users (id, cognito_sub, email, role, mfa_enrolled_at)
     values (
       $1, $2, $3, $4::user_role,
       case when $4::user_role = 'ADMIN' then now() end
     )`,
    [id, `sub-${id}`, `${id}@hufs.ac.kr`, role],
  );
};

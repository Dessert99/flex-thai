/** 로컬 시드가 관리자 작업과 학생 개인 데이터를 역할에 맞게 연결하는지 검증한다 */
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationDatabaseUrl = process.env.LOCAL_SEED_TEST_DATABASE_URL;

describe.runIf(integrationDatabaseUrl !== undefined)(
  '로컬 시드 사용자 연결 PostgreSQL 통합',
  () => {
    let pool: Pool;

    beforeAll(() => {
      if (!integrationDatabaseUrl) {
        throw new Error('LOCAL_SEED_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('학생 개인 데이터와 관리자 작업을 역할에 맞는 사용자에게 연결한다', async () => {
      const users = await pool.query(
        `select cognito_sub, email, role, mfa_enrolled_at
         from users
         where cognito_sub in ('local-admin-sub', 'local-learner-sub')
         order by cognito_sub`,
      );
      const owners = await pool.query(
        `select
           (select u.cognito_sub from question_attempts qa join users u on u.id = qa.user_id limit 1) as attempt_owner,
           (select u.cognito_sub from saved_questions sq join users u on u.id = sq.user_id limit 1) as question_owner,
           (select u.cognito_sub from wordbooks w join users u on u.id = w.user_id join wordbook_items wi on wi.wordbook_id = w.id limit 1) as vocabulary_owner,
           (select u.cognito_sub from content_imports ci join users u on u.id = ci.requested_by limit 1) as import_owner`,
      );

      expect(users.rows).toEqual([
        {
          cognito_sub: 'local-admin-sub',
          email: 'admin@hufs.ac.kr',
          role: 'ADMIN',
          mfa_enrolled_at: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          cognito_sub: 'local-learner-sub',
          email: 'learner@hufs.ac.kr',
          role: 'LEARNER',
          mfa_enrolled_at: null,
        },
      ]);
      expect(owners.rows[0]).toEqual({
        attempt_owner: 'local-learner-sub',
        question_owner: 'local-learner-sub',
        vocabulary_owner: 'local-learner-sub',
        import_owner: 'local-admin-sub',
      });
    });
  },
);

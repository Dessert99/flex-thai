/** 로컬 시드가 학습자 개인 데이터를 올바르게 연결하는지 검증한다 */
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

    it('단어장 항목이 로컬 학습자 계정에 속한다', async () => {
      const users = await pool.query(
        `select cognito_sub, email, role from users order by cognito_sub`,
      );
      const owners = await pool.query(
        `select distinct u.cognito_sub
         from wordbooks w
         join users u on u.id = w.user_id
         join wordbook_items wi on wi.wordbook_id = w.id`,
      );

      expect(users.rows).toEqual([
        {
          cognito_sub: 'local-learner-sub',
          email: 'learner@hufs.ac.kr',
          role: 'LEARNER',
        },
      ]);
      expect(owners.rows).toEqual([{ cognito_sub: 'local-learner-sub' }]);
    });
  },
);

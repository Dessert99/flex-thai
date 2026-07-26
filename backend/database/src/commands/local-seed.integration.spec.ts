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

    it('단어 연습 후보와 두 개념 영역과 신고 이력을 수동 테스트할 수 있다', async () => {
      const practice = await pool.query(
        `select
           count(distinct vm.id)::integer as meaning_count,
           count(distinct v.thai)::integer as thai_count,
           count(distinct vm.meaning_ko)::integer as label_count
         from wordbooks w
         join wordbook_items wi on wi.wordbook_id = w.id
         join vocabularies v on v.id = wi.vocabulary_id and v.status = 'PUBLISHED'
         join vocabulary_meanings vm on vm.vocabulary_id = v.id
         join vocabulary_meaning_pronunciations vmp
           on vmp.vocabulary_id = v.id and vmp.meaning_id = vm.id
         join vocabulary_pronunciations vp
           on vp.id = vmp.pronunciation_id and vp.vocabulary_id = v.id
         join media_assets ma on ma.id = vp.media_asset_id and ma.status = 'READY'
         where w.user_id = '00000000-0000-4000-8000-000000000002'`,
      );
      const concepts = await pool.query(
        `select cv.category, count(*)::integer as count
         from concepts c
         join concept_versions cv on cv.id = c.current_published_version_id
         where c.status = 'PUBLISHED' and cv.status = 'PUBLISHED'
         group by cv.category
         order by cv.category::text`,
      );
      const feedback = await pool.query(
        `select
           count(distinct r.id)::integer as report_count,
           count(h.id)::integer as history_count
         from content_error_reports r
         join content_error_report_history h on h.report_id = r.id`,
      );

      expect(practice.rows[0]).toEqual({
        meaning_count: 10,
        thai_count: 10,
        label_count: 10,
      });
      expect(concepts.rows).toEqual([
        { category: 'GRAMMAR', count: 1 },
        { category: 'THAI_SCRIPT_PRONUNCIATION', count: 1 },
      ]);
      expect(feedback.rows[0]).toMatchObject({
        report_count: 2,
        history_count: 4,
      });
    });
  },
);

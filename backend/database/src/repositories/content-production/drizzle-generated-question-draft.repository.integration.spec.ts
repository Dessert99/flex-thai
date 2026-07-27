/** 실제 PostgreSQL에서 생성 문제 승인 graph의 replay·동시성·rollback을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAiQuestionProductionRepository } from './drizzle-ai-question-production.repository.js';
import { DrizzleGeneratedQuestionDraftRepository } from './drizzle-generated-question-draft.repository.js';

const databaseUrl = process.env.AI_QUESTION_TEST_DATABASE_URL;

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const sentencePayload = (input: {
  meaningId: string;
  pronunciationId: string;
  vocabularyId: string;
}) => ({
  originalText: 'ไทย',
  translationKo: '태국',
  pronunciationKo: '타이',
  toneMarks: '',
  tokens: [
    {
      surface: 'ไทย',
      startOffset: 0,
      endOffset: 3,
      vocabulary: { id: input.vocabularyId },
      meaning: { id: input.meaningId },
      pronunciation: { id: input.pronunciationId },
      contextMeaningKo: '태국',
      role: 'TARGET',
    },
  ],
  expressions: [],
});

async function createFixture(
  pool: Pool,
  options?: { missingMeaning?: boolean },
) {
  const ids = {
    user: randomUUID(),
    job: randomUUID(),
    upload: randomUUID(),
    jobInput: randomUUID(),
    item: randomUUID(),
    questionType: randomUUID(),
    typeVersion: randomUUID(),
    topic: randomUUID(),
    tag: randomUUID(),
    vocabulary: randomUUID(),
    meaning: randomUUID(),
    pronunciation: randomUUID(),
    candidate: randomUUID(),
  };
  const typeSlug = `generated-${ids.questionType}`;
  const topicSlug = `topic-${ids.topic}`;
  const tagSlug = `tag-${ids.tag}`;
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [ids.user, `generated-${ids.user}`, `generated-${ids.user}@example.com`],
  );
  await pool.query(
    `insert into jobs (
       id, requested_by, client_request_id, type, purpose, status, attempt
     ) values (
       $1, $2, $3, 'QUESTION_GENERATION', 'QUESTION_GENERATION', 'COMPLETED', 0
     )`,
    [ids.job, ids.user, randomUUID()],
  );
  await pool.query(
    `insert into uploads (
       id, owner_id, input_type, object_key, declared_content_type, status
     ) values ($1, $2, 'TEXT', $3, 'text/plain', 'VERIFIED')`,
    [ids.upload, ids.user, `generated/${ids.upload}.txt`],
  );
  await pool.query(
    `insert into job_inputs (id, job_id, upload_id, ordinal)
     values ($1, $2, $3, 0)`,
    [ids.jobInput, ids.job, ids.upload],
  );
  await pool.query(
    `insert into job_items (
       id, job_id, job_input_id, operation, source_ref, status, attempt
     ) values (
       $1, $2, $3, 'QUESTION_GENERATION', 'generated-fixture', 'SUCCEEDED', 0
     )`,
    [ids.item, ids.job, ids.jobInput],
  );
  await pool.query(
    `insert into question_types (
       id, slug, display_name, skill, major_category
     ) values (
       $1, $2, '생성 선택형', 'READING', 'READING_VOCABULARY_GRAMMAR'
     )`,
    [ids.questionType, typeSlug],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, status,
       decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 2, 'ACTIVE', '{}')`,
    [ids.typeVersion, ids.questionType],
  );
  await pool.query(
    `insert into question_topics (id, slug, display_name, status)
     values ($1, $2, '생성 주제', 'ACTIVE')`,
    [ids.topic, topicSlug],
  );
  await pool.query(
    `insert into question_tags (id, slug, display_name, status)
     values ($1, $2, '생성 태그', 'ACTIVE')`,
    [ids.tag, tagSlug],
  );
  await pool.query(
    `insert into vocabularies (
       id, thai, normalized_thai, kind, status
     ) values ($1, 'ไทย', $2, 'WORD', 'PUBLISHED')`,
    [ids.vocabulary, `ไทย-${ids.vocabulary}`],
  );
  if (!options?.missingMeaning) {
    await pool.query(
      `insert into vocabulary_meanings (
         id, vocabulary_id, meaning_ko, part_of_speech
       ) values ($1, $2, '태국', '명사')`,
      [ids.meaning, ids.vocabulary],
    );
  }
  await pool.query(
    `insert into vocabulary_pronunciations (
       id, vocabulary_id, pronunciation_ko, tone_marks, media_asset_id
     ) values ($1, $2, '타이', '', null)`,
    [ids.pronunciation, ids.vocabulary],
  );
  const sentence = sentencePayload({
    meaningId: ids.meaning,
    pronunciationId: ids.pronunciation,
    vocabularyId: ids.vocabulary,
  });
  const payload = {
    questionTypeSlug: typeSlug,
    questionTypeVersion: 1,
    difficulty: 3,
    topicSlug,
    tagSlugs: [tagSlug],
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [{ speaker: null, sentence }],
      },
    ],
    options: [
      {
        clientRef: 'answer',
        position: 0,
        sentence,
        span: null,
      },
      {
        clientRef: 'distractor',
        position: 1,
        sentence,
        span: null,
      },
    ],
    correctOptionRef: 'answer',
  };
  await pool.query(
    `insert into question_production_candidates (
       id, job_item_id, job_attempt, ordinal, type_version_id, payload_state,
       topic_id, difficulty, payload, payload_hash, result_group, review_status,
       revision
     ) values (
       $1, $2, 0, 0, $3, 'CANONICAL', $4, 3, $5, $6, 'NORMAL', 'PENDING', 0
     )`,
    [
      ids.candidate,
      ids.item,
      ids.typeVersion,
      ids.topic,
      payload,
      'a'.repeat(64),
    ],
  );
  await pool.query(
    `insert into question_production_validations (
       candidate_id, stage, status, code, details
     ) values
       ($1, 'SCHEMA', 'PASSED', null, '{}'),
       ($1, 'DECISION_RULE', 'PASSED', null, '{}'),
       ($1, 'SIMILARITY', 'PASSED', null, '{}'),
       ($1, 'AI_CROSS_VALIDATION', 'PASSED', null, '{}')`,
    [ids.candidate],
  );
  return { ids, payload };
}

const command = (
  fixture: Fixture,
  requestId: string,
  actorUserId = fixture.ids.user,
) => ({
  candidateId: fixture.ids.candidate,
  expectedRevision: 0,
  actorUserId,
  actorSub: `generated-${fixture.ids.user}`,
  requestId,
  occurredAt: new Date('2026-07-27T00:00:00.000Z'),
});

describe.runIf(databaseUrl !== undefined)(
  '생성 문제 DRAFT PostgreSQL 승인 원자성',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error('AI_QUESTION_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{ candidate: string | null }>(
        `select to_regclass('question_production_candidates')::text candidate`,
      );
      if (!migration.rows[0]?.candidate) {
        throw new Error('Wave 5 migration이 적용된 격리 DB가 필요합니다.');
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    const repository = () =>
      new DrizzleAiQuestionProductionRepository(
        drizzle({ client: pool }) as never,
        () => new Date('2026-07-27T00:00:01.000Z'),
        new DrizzleGeneratedQuestionDraftRepository(),
      );

    it('같은 승인 request replay는 같은 graph를 반환하고 audit을 늘리지 않는다', async () => {
      const fixture = await createFixture(pool);
      const requestId = `approve-${randomUUID()}`;
      const first = await repository().approve(command(fixture, requestId));
      const replay = await repository().approve(command(fixture, requestId));

      expect(first).toMatchObject({ kind: 'APPROVED' });
      expect(replay).toEqual({
        ...first,
        kind: 'ALREADY_APPROVED',
      });
      const stored = await pool.query<{
        audits: string;
        blocks: string;
        questions: string;
        versions: string;
      }>(
        `select
           (select count(*)::text from questions where id = c.approved_question_id)
             questions,
           (select count(*)::text from question_versions
             where id = c.approved_question_version_id) versions,
           (select count(*)::text from question_blocks
             where question_version_id = c.approved_question_version_id) blocks,
           (select count(*)::text from audit_logs
             where target_id = c.id and action = 'QUESTION_CANDIDATE_APPROVED')
             audits
         from question_production_candidates c
         where c.id = $1`,
        [fixture.ids.candidate],
      );
      expect(stored.rows[0]).toEqual({
        audits: '1',
        blocks: '1',
        questions: '1',
        versions: '1',
      });
    });

    it('동시 승인 두 건은 하나의 DRAFT graph만 commit한다', async () => {
      const fixture = await createFixture(pool);
      const results = await Promise.all([
        repository().approve(command(fixture, `approve-a-${randomUUID()}`)),
        repository().approve(command(fixture, `approve-b-${randomUUID()}`)),
      ]);

      expect(results.filter(({ kind }) => kind === 'APPROVED')).toHaveLength(1);
      expect(results.filter(({ kind }) => kind === 'CONFLICT')).toHaveLength(1);
      const stored = await pool.query<{ audits: string; questions: string }>(
        `select
           (select count(*)::text from questions where id = c.approved_question_id)
             questions,
           (select count(*)::text from audit_logs
             where target_id = c.id and action = 'QUESTION_CANDIDATE_APPROVED')
             audits
         from question_production_candidates c
         where c.id = $1`,
        [fixture.ids.candidate],
      );
      expect(stored.rows[0]).toEqual({ audits: '1', questions: '1' });
    });

    it('canonical 참조 누락은 candidate와 graph를 모두 보존한다', async () => {
      const fixture = await createFixture(pool, { missingMeaning: true });
      const before = await pool.query<{ count: string }>(
        'select count(*)::text count from questions',
      );

      await expect(
        repository().approve(command(fixture, `approve-${randomUUID()}`)),
      ).rejects.toMatchObject({
        code: 'QUESTION_CANDIDATE_NOT_APPROVABLE',
      });

      const after = await pool.query<{ count: string }>(
        'select count(*)::text count from questions',
      );
      const candidate = await pool.query<{
        approvedQuestionId: string | null;
        reviewStatus: string;
        revision: number;
      }>(
        `select
           approved_question_id "approvedQuestionId",
           review_status "reviewStatus",
           revision
         from question_production_candidates where id = $1`,
        [fixture.ids.candidate],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
      expect(candidate.rows[0]).toEqual({
        approvedQuestionId: null,
        reviewStatus: 'PENDING',
        revision: 0,
      });
    });

    it('audit FK 실패는 앞선 graph와 candidate link를 전부 rollback한다', async () => {
      const fixture = await createFixture(pool);
      const before = await pool.query<{ count: string }>(
        'select count(*)::text count from questions',
      );

      await expect(
        repository().approve(
          command(
            fixture,
            `approve-${randomUUID()}`,
            'ffffffff-ffff-4fff-8fff-ffffffffffff',
          ),
        ),
      ).rejects.toBeTruthy();

      const after = await pool.query<{ count: string }>(
        'select count(*)::text count from questions',
      );
      const candidate = await pool.query<{
        approvedQuestionId: string | null;
        reviewStatus: string;
        revision: number;
      }>(
        `select
           approved_question_id "approvedQuestionId",
           review_status "reviewStatus",
           revision
         from question_production_candidates where id = $1`,
        [fixture.ids.candidate],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
      expect(candidate.rows[0]).toEqual({
        approvedQuestionId: null,
        reviewStatus: 'PENDING',
        revision: 0,
      });
    });
  },
);

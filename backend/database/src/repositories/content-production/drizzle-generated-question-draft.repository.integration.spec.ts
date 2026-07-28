/** 실제 PostgreSQL에서 생성 문제 승인 graph의 replay·동시성·rollback을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAiQuestionProductionRepository } from './drizzle-ai-question-production.repository.js';
import { DrizzleGeneratedQuestionDraftRepository } from './drizzle-generated-question-draft.repository.js';
import { DrizzleGeneratedQuestionTtsScheduler } from './drizzle-generated-question-tts.scheduler.js';
import { DrizzleAsyncDispatchOutboxRepository } from '../dispatch/drizzle-async-dispatch-outbox.repository.js';

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
    voicePreset: randomUUID(),
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
  await pool.query(
    `insert into tts_voice_presets (
       id, name, provider, model, voice, locale, audio_format,
       generation_revision, enabled
     ) values (
       $1, $2, 'LOCAL_FAKE', 'deterministic-v1', 'thai-female', 'th-TH',
       'audio/wav', 'v1', true
     )`,
    [ids.voicePreset, `generated-${ids.voicePreset}`],
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

type GraphTotals = {
  blockSentences: number;
  blocks: number;
  expressions: number;
  options: number;
  questionTags: number;
  questions: number;
  sentenceVersions: number;
  sentences: number;
  tokens: number;
  ttsItems: number;
  ttsJobs: number;
  ttsOutbox: number;
  versions: number;
};

const graphTotals = async (pool: Pool): Promise<GraphTotals> => {
  const { rows } = await pool.query<Record<keyof GraphTotals, string>>(
    `select
       (select count(*)::text from questions) questions,
       (select count(*)::text from question_versions) versions,
       (select count(*)::text from question_version_tags) "questionTags",
       (select count(*)::text from question_blocks) blocks,
       (select count(*)::text from question_block_sentences) "blockSentences",
       (select count(*)::text from question_options) options,
       (select count(*)::text from thai_sentences) sentences,
       (select count(*)::text from thai_sentence_versions) "sentenceVersions",
       (select count(*)::text from token_occurrences) tokens,
       (select count(*)::text from expression_occurrences) expressions,
       (select count(*)::text from tts_jobs) "ttsJobs",
       (select count(*)::text from tts_items) "ttsItems",
       (select count(*)::text from async_dispatch_outbox
        where payload_kind = 'TTS') "ttsOutbox"`,
  );
  const row = rows[0]!;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  ) as GraphTotals;
};

const expectGraphDelta = (
  before: GraphTotals,
  after: GraphTotals,
  expected: GraphTotals,
): void => {
  expect(
    Object.fromEntries(
      Object.keys(before).map((key) => [
        key,
        after[key as keyof GraphTotals] - before[key as keyof GraphTotals],
      ]),
    ),
  ).toEqual(expected);
};

const expectedGraphDelta: GraphTotals = {
  blockSentences: 1,
  blocks: 1,
  expressions: 0,
  options: 2,
  questionTags: 1,
  questions: 1,
  sentenceVersions: 3,
  sentences: 3,
  tokens: 3,
  ttsItems: 3,
  ttsJobs: 1,
  ttsOutbox: 1,
  versions: 1,
};

const expectExactCandidateGraph = async (
  pool: Pool,
  candidateId: string,
): Promise<void> => {
  const { rows } = await pool.query<{
    audits: string;
    blockSentences: string;
    blocks: string;
    expressions: string;
    nullMedia: string;
    options: string;
    questionTags: string;
    questions: string;
    sentenceVersions: string;
    sentences: string;
    tokens: string;
    ttsItems: string;
    ttsJobs: string;
    ttsOutbox: string;
    versions: string;
  }>(
    `with approved as (
       select approved_question_id question_id,
              approved_question_version_id question_version_id
       from question_production_candidates
       where id = $1
     ), graph_sentence_versions as (
       select qbs.sentence_version_id id
       from approved a
       join question_blocks qb on qb.question_version_id = a.question_version_id
       join question_block_sentences qbs on qbs.block_id = qb.id
       union
       select qo.sentence_version_id id
       from approved a
       join question_options qo on qo.question_version_id = a.question_version_id
       where qo.sentence_version_id is not null
     )
     select
       (select count(*)::text from approved a
        join questions q on q.id = a.question_id) questions,
       (select count(*)::text from approved a
        join question_versions qv
          on qv.id = a.question_version_id and qv.question_id = a.question_id)
         versions,
       (select count(*)::text from approved a
        join question_version_tags qvt
          on qvt.question_version_id = a.question_version_id) "questionTags",
       (select count(*)::text from approved a
        join question_blocks qb
          on qb.question_version_id = a.question_version_id) blocks,
       (select count(*)::text from approved a
        join question_blocks qb
          on qb.question_version_id = a.question_version_id
        join question_block_sentences qbs on qbs.block_id = qb.id)
         "blockSentences",
       (select count(*)::text from approved a
        join question_options qo
          on qo.question_version_id = a.question_version_id) options,
       (select count(*)::text from graph_sentence_versions) "sentenceVersions",
       (select count(distinct tsv.sentence_id)::text
        from graph_sentence_versions gsv
        join thai_sentence_versions tsv on tsv.id = gsv.id) sentences,
       (select count(*)::text from graph_sentence_versions gsv
        join token_occurrences occurrence
          on occurrence.sentence_version_id = gsv.id) tokens,
       (select count(*)::text from graph_sentence_versions gsv
        join expression_occurrences occurrence
          on occurrence.sentence_version_id = gsv.id) expressions,
       (select count(*)::text from graph_sentence_versions gsv
        join thai_sentence_versions tsv
          on tsv.id = gsv.id and tsv.media_asset_id is null) "nullMedia",
       (select count(*)::text from audit_logs
        where target_id = $1 and action = 'QUESTION_CANDIDATE_APPROVED') audits,
       (select count(*)::text from approved a
        join tts_items ti on ti.revision = a.question_version_id) "ttsItems",
       (select count(distinct ti.job_id)::text from approved a
        join tts_items ti on ti.revision = a.question_version_id) "ttsJobs",
       (select count(distinct ado.id)::text from approved a
        join tts_items ti on ti.revision = a.question_version_id
        join async_dispatch_outbox ado
          on ado.payload_kind = 'TTS' and ado.job_id = ti.job_id
        where ado.attempt = 0) "ttsOutbox"`,
    [candidateId],
  );
  expect(rows[0]).toEqual({
    audits: '1',
    blockSentences: '1',
    blocks: '1',
    expressions: '0',
    nullMedia: '3',
    options: '2',
    questionTags: '1',
    questions: '1',
    sentenceVersions: '3',
    sentences: '3',
    tokens: '3',
    ttsItems: '3',
    ttsJobs: '1',
    ttsOutbox: '1',
    versions: '1',
  });
};

const waitForApprovalInsertLock = async (pool: Pool): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await pool.query<{ waiting: boolean }>(
      `select exists(
         select 1 from pg_stat_activity
         where datname = current_database()
           and pid <> pg_backend_pid()
           and state = 'active'
           and wait_event_type = 'Lock'
           and query ilike '%insert into%questions%'
       ) waiting`,
    );
    if (rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('GENERATED_DRAFT_INSERT_LOCK_NOT_OBSERVED');
};

const expectStatusTransitionBlocked = async (
  pool: Pool,
  query: string,
  parameters: string[],
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local statement_timeout = '250ms'`);
    await expect(client.query(query, parameters)).rejects.toMatchObject({
      code: '57014',
    });
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
};

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

    const repository = (fixture: Fixture) => {
      const database = drizzle({ client: pool }) as never;
      const outbox = new DrizzleAsyncDispatchOutboxRepository(database);
      return new DrizzleAiQuestionProductionRepository(
        database,
        () => new Date('2026-07-27T00:00:01.000Z'),
        new DrizzleGeneratedQuestionDraftRepository(),
        undefined,
        new DrizzleGeneratedQuestionTtsScheduler(
          fixture.ids.voicePreset,
          outbox,
        ),
      );
    };

    it('같은 승인 request replay는 같은 graph를 반환하고 audit을 늘리지 않는다', async () => {
      const fixture = await createFixture(pool);
      const requestId = `approve-${randomUUID()}`;
      const before = await graphTotals(pool);
      const first = await repository(fixture).approve(
        command(fixture, requestId),
      );
      const replay = await repository(fixture).approve(
        command(fixture, requestId),
      );
      const after = await graphTotals(pool);

      expect(first).toMatchObject({ kind: 'APPROVED' });
      expect(replay).toEqual({
        ...first,
        kind: 'ALREADY_APPROVED',
      });
      expectGraphDelta(before, after, expectedGraphDelta);
      await expectExactCandidateGraph(pool, fixture.ids.candidate);
    });

    it('동시 승인 두 건은 하나의 DRAFT graph만 commit한다', async () => {
      const fixture = await createFixture(pool);
      const before = await graphTotals(pool);
      const results = await Promise.all([
        repository(fixture).approve(
          command(fixture, `approve-a-${randomUUID()}`),
        ),
        repository(fixture).approve(
          command(fixture, `approve-b-${randomUUID()}`),
        ),
      ]);
      const after = await graphTotals(pool);

      expect(results.filter(({ kind }) => kind === 'APPROVED')).toHaveLength(1);
      expect(results.filter(({ kind }) => kind === 'CONFLICT')).toHaveLength(1);
      expectGraphDelta(before, after, expectedGraphDelta);
      await expectExactCandidateGraph(pool, fixture.ids.candidate);
    });

    it('승인 중 유형·주제·태그·어휘 비활성화는 잠금 뒤로 직렬화된다', async () => {
      const fixture = await createFixture(pool);
      const before = await graphTotals(pool);
      const blocker: PoolClient = await pool.connect();
      let approval:
        ReturnType<ReturnType<typeof repository>['approve']> | undefined;
      try {
        await blocker.query('begin');
        await blocker.query('lock table questions in access exclusive mode');
        approval = repository(fixture).approve(
          command(fixture, `approve-${randomUUID()}`),
        );
        await waitForApprovalInsertLock(pool);

        await Promise.all([
          expectStatusTransitionBlocked(
            pool,
            `update question_type_versions
             set status = 'RETIRED'
             where id = $1 and status = 'ACTIVE'`,
            [fixture.ids.typeVersion],
          ),
          expectStatusTransitionBlocked(
            pool,
            `update question_topics set status = 'ARCHIVED'
             where id = $1`,
            [fixture.ids.topic],
          ),
          expectStatusTransitionBlocked(
            pool,
            `update question_tags set status = 'ARCHIVED'
             where id = $1`,
            [fixture.ids.tag],
          ),
          expectStatusTransitionBlocked(
            pool,
            `update vocabularies set status = 'HIDDEN'
             where id = $1 and status = 'PUBLISHED'`,
            [fixture.ids.vocabulary],
          ),
        ]);
        await blocker.query('commit');
        const approved = await approval;
        expect(approved.kind).toBe('APPROVED');
      } finally {
        await blocker.query('rollback').catch(() => undefined);
        blocker.release();
        await approval?.catch(() => undefined);
      }

      const statuses = await pool.query<{
        tagStatus: string;
        topicStatus: string;
        typeStatus: string;
        vocabularyStatus: string;
      }>(
        `select
           (select status from question_type_versions where id = $1)
             "typeStatus",
           (select status from question_topics where id = $2) "topicStatus",
           (select status from question_tags where id = $3) "tagStatus",
           (select status from vocabularies where id = $4) "vocabularyStatus"`,
        [
          fixture.ids.typeVersion,
          fixture.ids.topic,
          fixture.ids.tag,
          fixture.ids.vocabulary,
        ],
      );
      const after = await graphTotals(pool);
      expect(statuses.rows[0]).toEqual({
        tagStatus: 'ACTIVE',
        topicStatus: 'ACTIVE',
        typeStatus: 'ACTIVE',
        vocabularyStatus: 'PUBLISHED',
      });
      expectGraphDelta(before, after, expectedGraphDelta);
      await expectExactCandidateGraph(pool, fixture.ids.candidate);
    });

    it('canonical 참조 누락은 candidate와 graph를 모두 보존한다', async () => {
      const fixture = await createFixture(pool, { missingMeaning: true });
      const before = await graphTotals(pool);

      await expect(
        repository(fixture).approve(
          command(fixture, `approve-${randomUUID()}`),
        ),
      ).rejects.toMatchObject({
        code: 'QUESTION_CANDIDATE_NOT_APPROVABLE',
      });

      const after = await graphTotals(pool);
      const candidate = await pool.query<{
        approvedQuestionId: string | null;
        approvedQuestionVersionId: string | null;
        reviewStatus: string;
        revision: number;
      }>(
        `select
           approved_question_id "approvedQuestionId",
           approved_question_version_id "approvedQuestionVersionId",
           review_status "reviewStatus",
           revision
         from question_production_candidates where id = $1`,
        [fixture.ids.candidate],
      );
      expect(after).toEqual(before);
      expect(candidate.rows[0]).toEqual({
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
        reviewStatus: 'PENDING',
        revision: 0,
      });
    });

    it('audit insert 전용 trigger 실패는 graph·TTS·candidate 전이를 전부 rollback한다', async () => {
      const fixture = await createFixture(pool);
      const before = await graphTotals(pool);
      const requestId = `approve-${randomUUID()}`;
      const triggerName = 'wave5_fail_generated_question_audit';
      const functionName = 'wave5_fail_generated_question_audit';

      try {
        await pool.query(`drop trigger if exists ${triggerName} on audit_logs`);
        await pool.query(
          `create or replace function ${functionName}()
           returns trigger language plpgsql as $$
           begin
             if new.request_id = TG_ARGV[0] then
               raise exception 'WAVE5_AUDIT_INSERT_FAILED';
             end if;
             return new;
           end
           $$`,
        );
        await pool.query(
          `create trigger ${triggerName}
           before insert on audit_logs
           for each row execute function ${functionName}('${requestId}')`,
        );

        await expect(
          repository(fixture).approve(command(fixture, requestId)),
        ).rejects.toThrow('WAVE5_AUDIT_INSERT_FAILED');
      } finally {
        await pool
          .query(`drop trigger if exists ${triggerName} on audit_logs`)
          .catch(() => undefined);
        await pool
          .query(`drop function if exists ${functionName}()`)
          .catch(() => undefined);
      }

      const after = await graphTotals(pool);
      const candidate = await pool.query<{
        approvedQuestionId: string | null;
        approvedQuestionVersionId: string | null;
        reviewStatus: string;
        revision: number;
      }>(
        `select
           approved_question_id "approvedQuestionId",
           approved_question_version_id "approvedQuestionVersionId",
           review_status "reviewStatus",
           revision
         from question_production_candidates where id = $1`,
        [fixture.ids.candidate],
      );
      expect(after).toEqual(before);
      const audit = await pool.query<{ count: string }>(
        `select count(*)::text count from audit_logs where request_id = $1`,
        [requestId],
      );
      expect(audit.rows[0]?.count).toBe('0');
      expect(candidate.rows[0]).toEqual({
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
        reviewStatus: 'PENDING',
        revision: 0,
      });
    });

    it('TTS outbox writer 실패는 graph·job·candidate·audit을 함께 rollback한다', async () => {
      const fixture = await createFixture(pool);
      const before = await graphTotals(pool);
      const database = drizzle({ client: pool }) as never;
      const failingScheduler = new DrizzleGeneratedQuestionTtsScheduler(
        fixture.ids.voicePreset,
        {
          enqueueTts: () => Promise.reject(new Error('OUTBOX_FAILED')),
          assertTtsDispatch: () => Promise.resolve(),
        },
      );
      const failingRepository = new DrizzleAiQuestionProductionRepository(
        database,
        () => new Date('2026-07-27T00:00:01.000Z'),
        new DrizzleGeneratedQuestionDraftRepository(),
        undefined,
        failingScheduler,
      );

      await expect(
        failingRepository.approve(command(fixture, `approve-${randomUUID()}`)),
      ).rejects.toThrow('OUTBOX_FAILED');
      expect(await graphTotals(pool)).toEqual(before);
      const candidate = await pool.query<{
        reviewStatus: string;
        revision: number;
      }>(
        `select review_status "reviewStatus", revision
         from question_production_candidates where id = $1`,
        [fixture.ids.candidate],
      );
      expect(candidate.rows[0]).toEqual({
        reviewStatus: 'PENDING',
        revision: 0,
      });
    });
  },
);

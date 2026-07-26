/** 격리 PostgreSQL에서 단어 연습 snapshot·동시성·멱등 경계를 검증한다 */
import { drizzle } from 'drizzle-orm/node-postgres';
import type { MaterializedPracticeSession } from '@flex-thia/domain';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../schema/index.js';
import * as practiceSchema from '../schema/learning-practice.schema.js';
import { DrizzleVocabularyPracticeRepository } from './drizzle-vocabulary-practice.repository.js';

const databaseUrl = process.env.VOCABULARY_PRACTICE_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const ids = {
  user: uuid(701),
  vocabulary: uuid(702),
  meaning: uuid(703),
  media: uuid(704),
  pronunciation: uuid(705),
  option: uuid(706),
  secondOption: uuid(707),
  thirdOption: uuid(708),
  fourthOption: uuid(709),
};

const card = {
  id: ids.vocabulary,
  thai: 'คำฝึกทดสอบระบบ',
  kind: 'WORD' as const,
  meanings: [
    {
      id: ids.meaning,
      meaningKo: '배우다',
      partOfSpeech: '동사',
      difficulty: 1,
      contextNote: null,
    },
  ],
  pronunciations: [
    {
      id: ids.pronunciation,
      pronunciationKo: '리안',
      toneMarks: 'M',
      mediaAssetId: ids.media,
      storageKey: `practice/${ids.media}.mp3`,
    },
  ],
  meaningPronunciations: [
    { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
  ],
};

const options = [
  { id: ids.option, label: '배우다' },
  { id: ids.secondOption, label: '가르치다' },
  { id: ids.thirdOption, label: '읽다' },
  { id: ids.fourthOption, label: '쓰다' },
];

const createSessionInput = (
  sessionId: string,
  questionIds: string[],
): MaterializedPracticeSession => ({
  id: sessionId,
  userId: ids.user,
  sourceType: 'SEARCH_SELECTION' as const,
  sourceWordbookId: null,
  sourceLabel: '공용 검색',
  modes: ['THAI_TO_MEANING'],
  requestedQuestionCount: 10,
  order: 'SOURCE' as const,
  questionCount: questionIds.length,
  startedAt: new Date('2026-07-26T00:00:00.000Z'),
  questions: questionIds.map((questionId, index) => ({
    id: questionId,
    sessionId,
    position: index + 1,
    vocabularyId: ids.vocabulary,
    meaningId: ids.meaning,
    pronunciationId: null,
    mediaAssetId: null,
    mode: 'THAI_TO_MEANING' as const,
    prompt: { type: 'TEXT' as const, text: 'คำฝึกทดสอบระบบ' },
    options,
    correctOptionId: ids.option,
    card,
  })),
});

const answerInput = (
  sessionId: string,
  questionId: string,
  clientAnswerId: string,
) => ({
  userId: ids.user,
  sessionId,
  questionId,
  clientAnswerId,
  selectedOptionId: ids.option,
  answeredAt: new Date('2026-07-26T00:01:00.000Z'),
});

integration('DrizzleVocabularyPracticeRepository PostgreSQL', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool, {
    schema: { ...schema, ...practiceSchema },
  });
  const repository = new DrizzleVocabularyPracticeRepository(database);

  beforeAll(async () => {
    const table = await pool.query<{ name: string | null }>(
      `select to_regclass('vocabulary_practice_sessions')::text as name`,
    );
    if (!table.rows[0]?.name) {
      throw new Error('단어 연습 migration이 적용된 격리 DB가 필요합니다.');
    }
    await pool.query(
      `insert into users (id, cognito_sub, email) values ($1, $2, $3)`,
      [ids.user, `practice-${ids.user}`, `practice-${ids.user}@example.com`],
    );
    await pool.query(
      `insert into vocabularies (id, thai, normalized_thai, kind, status) values ($1, 'คำฝึกทดสอบระบบ', 'คำฝึกทดสอบระบบ', 'WORD', 'PUBLISHED')`,
      [ids.vocabulary],
    );
    await pool.query(
      `insert into vocabulary_meanings (id, vocabulary_id, meaning_ko, part_of_speech, difficulty) values ($1, $2, '배우다', '동사', 1)`,
      [ids.meaning, ids.vocabulary],
    );
    await pool.query(
      `insert into media_assets (id, storage_key, declared_mime_type, declared_size_bytes, declared_sha256, mime_type, size_bytes, sha256, status, ready_at) values ($1, $2, 'audio/mpeg', 1, $3, 'audio/mpeg', 1, $3, 'READY', now())`,
      [ids.media, `practice/${ids.media}.mp3`, 'a'.repeat(64)],
    );
    await pool.query(
      `insert into vocabulary_pronunciations (id, vocabulary_id, pronunciation_ko, tone_marks, media_asset_id) values ($1, $2, '리안', 'M', $3)`,
      [ids.pronunciation, ids.vocabulary, ids.media],
    );
    await pool.query(
      `insert into vocabulary_meaning_pronunciations (vocabulary_id, meaning_id, pronunciation_id) values ($1, $2, $3)`,
      [ids.vocabulary, ids.meaning, ids.pronunciation],
    );
  });

  beforeEach(async () => {
    await pool.query(
      `delete from vocabulary_practice_answers where user_id = $1`,
      [ids.user],
    );
    await pool.query(
      `delete from vocabulary_practice_questions where session_id in (
        select id from vocabulary_practice_sessions where user_id = $1
      )`,
      [ids.user],
    );
    await pool.query(
      `delete from vocabulary_practice_sessions where user_id = $1`,
      [ids.user],
    );
  });

  afterAll(async () => {
    await pool.query(
      `delete from vocabulary_practice_answers where user_id = $1`,
      [ids.user],
    );
    await pool.query(
      `delete from vocabulary_practice_questions where session_id in (
        select id from vocabulary_practice_sessions where user_id = $1
      )`,
      [ids.user],
    );
    await pool.query(
      `delete from vocabulary_practice_sessions where user_id = $1`,
      [ids.user],
    );
    await pool.query(
      `delete from vocabulary_meaning_pronunciations where meaning_id = $1`,
      [ids.meaning],
    );
    await pool.query(`delete from vocabulary_pronunciations where id = $1`, [
      ids.pronunciation,
    ]);
    await pool.query(`delete from media_assets where id = $1`, [ids.media]);
    await pool.query(`delete from vocabulary_meanings where id = $1`, [
      ids.meaning,
    ]);
    await pool.query(`delete from vocabularies where id = $1`, [
      ids.vocabulary,
    ]);
    await pool.query(`delete from users where id = $1`, [ids.user]);
    await pool.end();
  });

  it('같은 clientAnswerId 재전송은 원시 답을 한 행만 저장한다', async () => {
    const sessionId = uuid(710);
    const questionId = uuid(711);
    const clientAnswerId = uuid(712);
    await repository.createSession(createSessionInput(sessionId, [questionId]));
    const input = answerInput(sessionId, questionId, clientAnswerId);

    await expect(repository.submitAnswer(input)).resolves.toMatchObject({
      status: 'ANSWERED',
      sessionCompleted: true,
    });
    await expect(repository.submitAnswer(input)).resolves.toMatchObject({
      status: 'ANSWERED',
      sessionCompleted: true,
    });
    const count = await answerCount(pool, sessionId);
    expect(count).toBe('1');
  });

  it('서로 다른 session의 같은 clientAnswerId 동시 제출은 하나만 저장한다', async () => {
    const firstSessionId = uuid(720);
    const secondSessionId = uuid(721);
    const firstQuestionId = uuid(722);
    const secondQuestionId = uuid(723);
    const clientAnswerId = uuid(724);
    await repository.createSession(
      createSessionInput(firstSessionId, [firstQuestionId]),
    );
    await repository.createSession(
      createSessionInput(secondSessionId, [secondQuestionId]),
    );

    const results = await Promise.all([
      repository.submitAnswer(
        answerInput(firstSessionId, firstQuestionId, clientAnswerId),
      ),
      repository.submitAnswer(
        answerInput(secondSessionId, secondQuestionId, clientAnswerId),
      ),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      'ANSWERED',
      'IDEMPOTENCY_CONFLICT',
    ]);
    expect(await answerCount(pool, null)).toBe('1');
  });

  it('동시 마지막 답은 한 요청만 완료하고 답 한 행만 저장한다', async () => {
    const sessionId = uuid(730);
    const firstQuestionId = uuid(731);
    const lastQuestionId = uuid(732);
    await repository.createSession(
      createSessionInput(sessionId, [firstQuestionId, lastQuestionId]),
    );
    await repository.submitAnswer(
      answerInput(sessionId, firstQuestionId, uuid(733)),
    );

    const results = await Promise.all([
      repository.submitAnswer(
        answerInput(sessionId, lastQuestionId, uuid(734)),
      ),
      repository.submitAnswer(
        answerInput(sessionId, lastQuestionId, uuid(735)),
      ),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      'ANSWERED',
      'COMPLETED',
    ]);
    expect(await answerCount(pool, sessionId)).toBe('2');
    const status = await pool.query<{ status: string }>(
      `select status from vocabulary_practice_sessions where id = $1`,
      [sessionId],
    );
    expect(status.rows[0]?.status).toBe('COMPLETED');
  });

  it('완료 세션의 새 clientAnswerId 제출을 거부한다', async () => {
    const sessionId = uuid(740);
    const questionId = uuid(741);
    await repository.createSession(createSessionInput(sessionId, [questionId]));
    await repository.submitAnswer(
      answerInput(sessionId, questionId, uuid(742)),
    );

    await expect(
      repository.submitAnswer(answerInput(sessionId, questionId, uuid(743))),
    ).resolves.toEqual({ status: 'COMPLETED' });
    expect(await answerCount(pool, sessionId)).toBe('1');
  });

  it('원본 어휘가 바뀌어도 생성 당시 question snapshot을 보존한다', async () => {
    const sessionId = uuid(750);
    const questionId = uuid(751);
    await repository.createSession(createSessionInput(sessionId, [questionId]));
    await pool.query(
      `update vocabularies set thai = 'เปลี่ยน', normalized_thai = 'เปลี่ยน' where id = $1`,
      [ids.vocabulary],
    );
    await pool.query(
      `update vocabulary_meanings set meaning_ko = '변경됨' where id = $1`,
      [ids.meaning],
    );
    try {
      const session = await repository.getSession(ids.user, sessionId);
      expect(session?.questions[0]?.card).toEqual(card);
      expect(session?.questions[0]?.prompt).toEqual({
        type: 'TEXT',
        text: 'คำฝึกทดสอบระบบ',
      });
    } finally {
      await pool.query(
        `update vocabularies set thai = 'คำฝึกทดสอบระบบ', normalized_thai = 'คำฝึกทดสอบระบบ' where id = $1`,
        [ids.vocabulary],
      );
      await pool.query(
        `update vocabulary_meanings set meaning_ko = '배우다' where id = $1`,
        [ids.meaning],
      );
    }
  });
});

async function answerCount(pool: Pool, sessionId: string | null) {
  const result =
    sessionId === null
      ? await pool.query<{ count: string }>(
          `select count(*)::text as count from vocabulary_practice_answers where user_id = $1`,
          [ids.user],
        )
      : await pool.query<{ count: string }>(
          `select count(*)::text as count from vocabulary_practice_answers where session_id = $1`,
          [sessionId],
        );
  return result.rows[0]?.count;
}

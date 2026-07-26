/** 격리 PostgreSQL에서 단어 연습 snapshot 저장과 답안 재전송 멱등성을 검증한다 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../schema/index.js';
import * as practiceSchema from '../schema/learning-practice.schema.js';
import { DrizzleVocabularyPracticeRepository } from './drizzle-vocabulary-practice.repository.js';

const databaseUrl = process.env.VOCABULARY_PRACTICE_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

const ids = {
  user: '00000000-0000-4000-8000-000000000701',
  vocabulary: '00000000-0000-4000-8000-000000000702',
  meaning: '00000000-0000-4000-8000-000000000703',
  media: '00000000-0000-4000-8000-000000000704',
  pronunciation: '00000000-0000-4000-8000-000000000705',
  session: '00000000-0000-4000-8000-000000000706',
  question: '00000000-0000-4000-8000-000000000707',
  option: '00000000-0000-4000-8000-000000000708',
  secondOption: '00000000-0000-4000-8000-000000000709',
  thirdOption: '00000000-0000-4000-8000-000000000710',
  fourthOption: '00000000-0000-4000-8000-000000000711',
  clientAnswer: '00000000-0000-4000-8000-000000000712',
  answer: '00000000-0000-4000-8000-000000000713',
} as const;

integration('DrizzleVocabularyPracticeRepository PostgreSQL', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool, {
    schema: { ...schema, ...practiceSchema },
  });

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
      `insert into vocabularies (id, thai, normalized_thai, kind, status) values ($1, 'เรียน', 'เรียน', 'WORD', 'PUBLISHED')`,
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

  afterAll(async () => {
    await pool.query(
      `delete from vocabulary_practice_answers where user_id = $1`,
      [ids.user],
    );
    await pool.query(
      `delete from vocabulary_practice_questions where session_id = $1`,
      [ids.session],
    );
    await pool.query(`delete from vocabulary_practice_sessions where id = $1`, [
      ids.session,
    ]);
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
    const repository = new DrizzleVocabularyPracticeRepository(
      database as never,
      undefined,
      () => ids.answer,
    );
    const card = {
      id: ids.vocabulary,
      thai: 'เรียน',
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
    await repository.createSession({
      id: ids.session,
      userId: ids.user,
      sourceType: 'SEARCH_SELECTION',
      sourceWordbookId: null,
      sourceLabel: '공용 검색',
      modes: ['THAI_TO_MEANING'],
      requestedQuestionCount: 10,
      order: 'SOURCE',
      questionCount: 1,
      startedAt: new Date('2026-07-26T00:00:00.000Z'),
      questions: [
        {
          id: ids.question,
          sessionId: ids.session,
          position: 1,
          vocabularyId: ids.vocabulary,
          meaningId: ids.meaning,
          pronunciationId: null,
          mediaAssetId: null,
          mode: 'THAI_TO_MEANING',
          prompt: { type: 'TEXT', text: 'เรียน' },
          options: [
            { id: ids.option, label: '배우다' },
            { id: ids.secondOption, label: '가르치다' },
            { id: ids.thirdOption, label: '읽다' },
            { id: ids.fourthOption, label: '쓰다' },
          ],
          correctOptionId: ids.option,
          card,
        },
      ],
    });
    const answerInput = {
      userId: ids.user,
      sessionId: ids.session,
      questionId: ids.question,
      clientAnswerId: ids.clientAnswer,
      selectedOptionId: ids.option,
      answeredAt: new Date('2026-07-26T00:01:00.000Z'),
    };

    await expect(repository.submitAnswer(answerInput)).resolves.toMatchObject({
      status: 'ANSWERED',
      sessionCompleted: true,
    });
    await expect(repository.submitAnswer(answerInput)).resolves.toMatchObject({
      status: 'ANSWERED',
      sessionCompleted: true,
    });
    const count = await pool.query<{ count: string }>(
      `select count(*)::text as count from vocabulary_practice_answers where session_id = $1`,
      [ids.session],
    );
    expect(count.rows[0]?.count).toBe('1');
  });
});

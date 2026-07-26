/** 실제 PostgreSQL에서 추천 distinct 신호·상태 제외·표현 overlap을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../schema/index.js';
import { DrizzleRecommendationQuery } from './drizzle-recommendation.query.js';

const databaseUrl = process.env.RECOMMENDATION_TEST_DATABASE_URL;

interface VocabularyFixture {
  id: string;
  meaningId: string;
  pronunciationId: string;
}

interface QuestionFixture {
  id: string;
  versionId: string;
  optionId: string;
}

const insertVocabulary = async (
  client: PoolClient,
  mediaId: string,
  label: string,
  kind: 'WORD' | 'EXPRESSION',
  status: 'PUBLISHED' | 'HIDDEN',
  publishedAt: string,
): Promise<VocabularyFixture> => {
  const id = randomUUID();
  const meaningId = randomUUID();
  const pronunciationId = randomUUID();
  await client.query(
    `insert into vocabularies (
       id, thai, normalized_thai, kind, status, published_at
     ) values ($1, $2, $3, $4, $5, $6)`,
    [id, `คำ-${label}`, `คำ-${label}`, kind, status, publishedAt],
  );
  await client.query(
    `insert into vocabulary_meanings (
       id, vocabulary_id, meaning_ko, part_of_speech, difficulty
     ) values ($1, $2, $3, '명사', 2)`,
    [meaningId, id, `뜻-${label}`],
  );
  await client.query(
    `insert into vocabulary_pronunciations (
       id, vocabulary_id, pronunciation_ko, tone_marks, media_asset_id
     ) values ($1, $2, $3, 'M', $4)`,
    [pronunciationId, id, `발음-${label}`, mediaId],
  );
  return { id, meaningId, pronunciationId };
};

const insertQuestion = async (
  client: PoolClient,
  typeVersionId: string,
  optionSentenceVersionId: string,
  status: 'PUBLISHED' | 'HIDDEN',
  publishedAt: string,
): Promise<QuestionFixture> => {
  const id = randomUUID();
  const versionId = randomUUID();
  const optionId = randomUUID();
  await client.query(
    `insert into questions (id, status) values ($1, 'DRAFT')`,
    [id],
  );
  await client.query(
    `insert into question_versions (
       id, question_id, version, type_version_id, difficulty, status,
       validation_status, validated_at, published_at
     ) values ($1, $2, 1, $3, 2, 'PUBLISHED', 'PASSED', $4, $4)`,
    [versionId, id, typeVersionId, publishedAt],
  );
  await client.query(
    `insert into question_options (
       id, question_version_id, sentence_version_id, position, is_correct
     ) values ($1, $2, $3, 0, true)`,
    [optionId, versionId, optionSentenceVersionId],
  );
  await client.query(
    `update questions
     set status = $2, current_published_version_id = $3
     where id = $1`,
    [id, status, versionId],
  );
  return { id, versionId, optionId };
};

const attachTargetVocabulary = async (
  client: PoolClient,
  mediaId: string,
  questionVersionId: string,
  vocabulary: VocabularyFixture,
  label: string,
): Promise<void> => {
  const sentenceId = randomUUID();
  const sentenceVersionId = randomUUID();
  const blockId = randomUUID();
  await client.query(`insert into thai_sentences (id) values ($1)`, [
    sentenceId,
  ]);
  await client.query(
    `insert into thai_sentence_versions (
       id, sentence_id, version, original_text, translation_ko,
       pronunciation_ko, tone_marks, media_asset_id, frozen_at
     ) values ($1, $2, 1, $3, $3, $3, 'M', $4, now())`,
    [sentenceVersionId, sentenceId, label, mediaId],
  );
  await client.query(
    `insert into question_blocks (
       id, question_version_id, kind, display_mode, position
     ) values ($1, $2, 'QUESTION', 'TEXT', 0)`,
    [blockId, questionVersionId],
  );
  await client.query(
    `insert into question_block_sentences (
       id, block_id, sentence_version_id, position
     ) values ($1, $2, $3, 0)`,
    [randomUUID(), blockId, sentenceVersionId],
  );
  await client.query(
    `insert into token_occurrences (
       id, sentence_version_id, position, surface, start_offset, end_offset,
       vocabulary_id, meaning_id, pronunciation_id, context_meaning_ko, role
     ) values ($1, $2, 0, $3, 0, 1, $4, $5, $6, $3, 'TARGET')`,
    [
      randomUUID(),
      sentenceVersionId,
      label,
      vocabulary.id,
      vocabulary.meaningId,
      vocabulary.pronunciationId,
    ],
  );
};

describe.runIf(databaseUrl !== undefined)(
  'DrizzleRecommendationQuery PostgreSQL',
  () => {
    let pool: Pool;

    beforeAll(() => {
      if (!databaseUrl) {
        throw new Error('RECOMMENDATION_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: databaseUrl });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('4개 신호는 fallback하고 5개부터 상태 제외와 표현 overlap을 적용한다', async () => {
      const client = await pool.connect();
      await client.query('begin');

      try {
        const userId = randomUUID();
        const mediaId = randomUUID();
        const baseSentenceId = randomUUID();
        const baseSentenceVersionId = randomUUID();
        const typeId = randomUUID();
        const typeVersionId = randomUUID();
        await client.query(
          `insert into users (id, cognito_sub, email)
           values ($1, $2, $3)`,
          [userId, `recommendation-${userId}`, `${userId}@example.com`],
        );
        await client.query(
          `insert into media_assets (
             id, storage_key, declared_mime_type, declared_size_bytes,
             declared_sha256, mime_type, size_bytes, sha256, status, ready_at
           ) values ($1, $2, 'audio/mpeg', 1, $3, 'audio/mpeg', 1, $3, 'READY', now())`,
          [mediaId, `recommendations/${mediaId}.mp3`, 'a'.repeat(64)],
        );
        await client.query(`insert into thai_sentences (id) values ($1)`, [
          baseSentenceId,
        ]);
        await client.query(
          `insert into thai_sentence_versions (
             id, sentence_id, version, original_text, translation_ko,
             pronunciation_ko, tone_marks, media_asset_id, frozen_at
           ) values ($1, $2, 1, 'ตัวเลือก', '선택지', '선택지', 'M', $3, now())`,
          [baseSentenceVersionId, baseSentenceId, mediaId],
        );
        await client.query(
          `insert into question_types (
             id, slug, display_name, skill
           ) values ($1, $2, '문맥 문제', 'READING')`,
          [typeId, `recommendation-${typeId}`],
        );
        await client.query(
          `insert into question_type_versions (
             id, question_type_id, version, template, option_count,
             decision_rules
           ) values ($1, $2, 1, 'STANDARD_CHOICE', 1, '{}'::jsonb)`,
          [typeVersionId, typeId],
        );

        const wordbookVocabulary = await insertVocabulary(
          client,
          mediaId,
          'wordbook',
          'WORD',
          'PUBLISHED',
          '2026-07-20T00:00:00.000Z',
        );
        const practiceVocabulary = await insertVocabulary(
          client,
          mediaId,
          'practice',
          'WORD',
          'PUBLISHED',
          '2026-07-21T00:00:00.000Z',
        );
        const targetVocabulary = await insertVocabulary(
          client,
          mediaId,
          'target',
          'WORD',
          'PUBLISHED',
          '2026-07-22T00:00:00.000Z',
        );
        const overlappingExpression = await insertVocabulary(
          client,
          mediaId,
          'overlap',
          'EXPRESSION',
          'PUBLISHED',
          '2026-07-25T00:00:00.000Z',
        );
        const supportingExpression = await insertVocabulary(
          client,
          mediaId,
          'supporting',
          'EXPRESSION',
          'PUBLISHED',
          '2026-07-26T00:00:00.000Z',
        );
        const hiddenVocabulary = await insertVocabulary(
          client,
          mediaId,
          'hidden',
          'WORD',
          'HIDDEN',
          '2026-07-27T00:00:00.000Z',
        );

        const attemptedQuestion = await insertQuestion(
          client,
          typeVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-20T00:00:00.000Z',
        );
        const savedQuestion = await insertQuestion(
          client,
          typeVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-21T00:00:00.000Z',
        );
        const vocabularyQuestion = await insertQuestion(
          client,
          typeVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-25T00:00:00.000Z',
        );
        const hiddenQuestion = await insertQuestion(
          client,
          typeVersionId,
          baseSentenceVersionId,
          'HIDDEN',
          '2026-07-27T00:00:00.000Z',
        );
        const invalidAttemptQuestion = await insertQuestion(
          client,
          typeVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-24T00:00:00.000Z',
        );

        for (const [attemptNo, isCorrect] of [
          [1, false],
          [2, true],
        ] as const) {
          await client.query(
            `insert into question_attempts (
               id, user_id, question_id, question_version_id, attempt_no,
               selected_option_id, client_attempt_id, duration_ms,
               is_correct, submitted_at
             ) values ($1, $2, $3, $4, $5, $6, $7, 1000, $8, now())`,
            [
              randomUUID(),
              userId,
              attemptedQuestion.id,
              attemptedQuestion.versionId,
              attemptNo,
              attemptedQuestion.optionId,
              randomUUID(),
              isCorrect,
            ],
          );
        }

        const invalidVersionId = randomUUID();
        const invalidOptionId = randomUUID();
        await client.query(
          `insert into question_versions (
             id, question_id, version, type_version_id, difficulty, status,
             validation_status, validation_issues
           ) values ($1, $2, 2, $3, 2, 'INVALIDATED', 'FAILED', '[]'::jsonb)`,
          [invalidVersionId, invalidAttemptQuestion.id, typeVersionId],
        );
        await client.query(
          `insert into question_options (
             id, question_version_id, sentence_version_id, position, is_correct
           ) values ($1, $2, $3, 0, true)`,
          [invalidOptionId, invalidVersionId, baseSentenceVersionId],
        );
        await client.query(
          `insert into question_attempts (
             id, user_id, question_id, question_version_id, attempt_no,
             selected_option_id, client_attempt_id, duration_ms,
             is_correct, submitted_at
           ) values ($1, $2, $3, $4, 1, $5, $6, 1000, false, now())`,
          [
            randomUUID(),
            userId,
            invalidAttemptQuestion.id,
            invalidVersionId,
            invalidOptionId,
            randomUUID(),
          ],
        );
        await client.query(
          `insert into saved_questions (user_id, question_id, saved_at)
           values ($1, $2, now()), ($1, $3, now())`,
          [userId, savedQuestion.id, hiddenQuestion.id],
        );

        const firstWordbookId = randomUUID();
        const secondWordbookId = randomUUID();
        await client.query(
          `insert into wordbooks (id, user_id, name, created_at, updated_at)
           values
             ($1, $3, '추천 단어장 1', now(), now()),
             ($2, $3, '추천 단어장 2', now(), now())`,
          [firstWordbookId, secondWordbookId, userId],
        );
        await client.query(
          `insert into wordbook_items (
             wordbook_id, vocabulary_id, added_at
           ) values ($1, $3, now()), ($2, $3, now()), ($1, $4, now())`,
          [
            firstWordbookId,
            secondWordbookId,
            wordbookVocabulary.id,
            hiddenVocabulary.id,
          ],
        );

        const sessionId = randomUUID();
        const practiceQuestionId = randomUUID();
        const correctOptionId = randomUUID();
        await client.query(
          `insert into vocabulary_practice_sessions (
             id, user_id, source_type, source_label, modes,
             requested_question_count, question_order, question_count,
             started_at
           ) values (
             $1, $2, 'SEARCH_SELECTION', '추천 통합',
             array['THAI_TO_MEANING']::vocabulary_practice_mode[],
             10, 'SOURCE', 1, now()
           )`,
          [sessionId, userId],
        );
        await client.query(
          `insert into vocabulary_practice_questions (
             id, session_id, position, vocabulary_id, meaning_id, mode,
             prompt_text, thai_snapshot, meaning_ko_snapshot, options,
             correct_option_id, card_snapshot
           ) values (
             $1, $2, 1, $3, $4, 'THAI_TO_MEANING', '연습',
             '연습', '연습', $5::jsonb, $6, '{}'::jsonb
           )`,
          [
            practiceQuestionId,
            sessionId,
            practiceVocabulary.id,
            practiceVocabulary.meaningId,
            JSON.stringify([{ id: correctOptionId, label: '정답' }]),
            correctOptionId,
          ],
        );
        await client.query(
          `insert into vocabulary_practice_answers (
             id, session_id, question_id, user_id, client_answer_id,
             selected_option_id, selected_label_snapshot, is_correct,
             answered_at
           ) values ($1, $2, $3, $4, $5, $6, '오답', false, now())`,
          [
            randomUUID(),
            sessionId,
            practiceQuestionId,
            userId,
            randomUUID(),
            randomUUID(),
          ],
        );

        const contentSentenceId = randomUUID();
        const contentSentenceVersionId = randomUUID();
        const blockId = randomUUID();
        await client.query(`insert into thai_sentences (id) values ($1)`, [
          contentSentenceId,
        ]);
        await client.query(
          `insert into thai_sentence_versions (
             id, sentence_id, version, original_text, translation_ko,
             pronunciation_ko, tone_marks, media_asset_id, frozen_at
           ) values ($1, $2, 1, 'หนึ่งสองสามสี่', '문장', '문장', 'M', $3, now())`,
          [contentSentenceVersionId, contentSentenceId, mediaId],
        );
        await client.query(
          `insert into question_blocks (
             id, question_version_id, kind, display_mode, position
           ) values ($1, $2, 'QUESTION', 'TEXT', 0)`,
          [blockId, vocabularyQuestion.versionId],
        );
        await client.query(
          `insert into question_block_sentences (
             id, block_id, sentence_version_id, position
           ) values ($1, $2, $3, 0)`,
          [randomUUID(), blockId, contentSentenceVersionId],
        );
        for (const [position, role] of [
          [0, 'TARGET'],
          [1, 'SUPPORTING'],
          [2, 'SUPPORTING'],
          [3, 'SUPPORTING'],
        ] as const) {
          await client.query(
            `insert into token_occurrences (
               id, sentence_version_id, position, surface, start_offset,
               end_offset, vocabulary_id, meaning_id, pronunciation_id,
               context_meaning_ko, role
             ) values ($1, $2, $3, $4, $3, $3 + 1, $5, $6, $7, '핵심', $8)`,
            [
              randomUUID(),
              contentSentenceVersionId,
              position,
              `token-${position}`,
              targetVocabulary.id,
              targetVocabulary.meaningId,
              targetVocabulary.pronunciationId,
              role,
            ],
          );
        }
        for (const [expression, startTokenIndex, endTokenIndex] of [
          [overlappingExpression, 0, 2],
          [supportingExpression, 2, 4],
        ] as const) {
          await client.query(
            `insert into expression_occurrences (
               id, sentence_version_id, start_token_index, end_token_index,
               vocabulary_id, vocabulary_kind, meaning_id, pronunciation_id,
               context_meaning_ko, representative
             ) values ($1, $2, $3, $4, $5, 'EXPRESSION', $6, $7, '표현', true)`,
            [
              randomUUID(),
              contentSentenceVersionId,
              startTokenIndex,
              endTokenIndex,
              expression.id,
              expression.meaningId,
              expression.pronunciationId,
            ],
          );
        }

        const query = new DrizzleRecommendationQuery(
          drizzle(client, { schema }),
        );
        const fallback = await query.getForUser(userId);
        expect(fallback.mode).toBe('FALLBACK');
        expect(fallback.meaningfulSignalCount).toBe(4);
        expect(
          fallback.questions.some(
            ({ questionId }) => questionId === hiddenQuestion.id,
          ),
        ).toBe(false);
        expect(
          fallback.vocabularies.some(({ id }) => id === hiddenVocabulary.id),
        ).toBe(false);

        await client.query(
          `insert into saved_questions (user_id, question_id, saved_at)
           values ($1, $2, now())`,
          [userId, vocabularyQuestion.id],
        );
        const personalized = await query.getForUser(userId);
        expect(personalized.mode).toBe('PERSONALIZED');
        expect(personalized.meaningfulSignalCount).toBe(5);
        expect(personalized.vocabularies.map(({ id }) => id)).toContain(
          overlappingExpression.id,
        );
        expect(personalized.vocabularies.map(({ id }) => id)).not.toContain(
          supportingExpression.id,
        );
      } finally {
        await client.query('rollback');
        client.release();
      }
    });

    it('첫 오답 버전 graph와 공개 어휘만 유형·어휘 추천 신호로 사용한다', async () => {
      const client = await pool.connect();
      await client.query('begin');

      try {
        const firstUserId = randomUUID();
        const secondUserId = randomUUID();
        const mediaId = randomUUID();
        const baseSentenceId = randomUUID();
        const baseSentenceVersionId = randomUUID();
        await client.query(
          `insert into users (id, cognito_sub, email)
           values ($1, $2, $3), ($4, $5, $6)`,
          [
            firstUserId,
            `recommendation-${firstUserId}`,
            `${firstUserId}@example.com`,
            secondUserId,
            `recommendation-${secondUserId}`,
            `${secondUserId}@example.com`,
          ],
        );
        await client.query(
          `insert into media_assets (
             id, storage_key, declared_mime_type, declared_size_bytes,
             declared_sha256, mime_type, size_bytes, sha256, status, ready_at
           ) values ($1, $2, 'audio/mpeg', 1, $3, 'audio/mpeg', 1, $3, 'READY', now())`,
          [mediaId, `recommendations/${mediaId}.mp3`, 'b'.repeat(64)],
        );
        await client.query(`insert into thai_sentences (id) values ($1)`, [
          baseSentenceId,
        ]);
        await client.query(
          `insert into thai_sentence_versions (
             id, sentence_id, version, original_text, translation_ko,
             pronunciation_ko, tone_marks, media_asset_id, frozen_at
           ) values ($1, $2, 1, '선택지', '선택지', '선택지', 'M', $3, now())`,
          [baseSentenceVersionId, baseSentenceId, mediaId],
        );

        const typeAId = randomUUID();
        const typeAVersionId = randomUUID();
        const typeBId = randomUUID();
        const typeBVersionId = randomUUID();
        await client.query(
          `insert into question_types (id, slug, display_name, skill)
           values
             ($1, $2, '유형 A', 'READING'),
             ($3, $4, '유형 B', 'READING')`,
          [
            typeAId,
            `recommendation-a-${typeAId}`,
            typeBId,
            `recommendation-b-${typeBId}`,
          ],
        );
        await client.query(
          `insert into question_type_versions (
             id, question_type_id, version, template, option_count,
             decision_rules
           ) values
             ($1, $2, 1, 'STANDARD_CHOICE', 1, '{}'::jsonb),
             ($3, $4, 1, 'STANDARD_CHOICE', 1, '{}'::jsonb)`,
          [typeAVersionId, typeAId, typeBVersionId, typeBId],
        );

        const attemptedTarget = await insertVocabulary(
          client,
          mediaId,
          'attempted-x',
          'WORD',
          'PUBLISHED',
          '2026-07-20T00:00:00.000Z',
        );
        const currentTarget = await insertVocabulary(
          client,
          mediaId,
          'current-y',
          'WORD',
          'PUBLISHED',
          '2026-07-21T00:00:00.000Z',
        );
        const firstSignalVocabulary = await insertVocabulary(
          client,
          mediaId,
          'signal-1',
          'WORD',
          'PUBLISHED',
          '2026-07-22T00:00:00.000Z',
        );
        const secondSignalVocabulary = await insertVocabulary(
          client,
          mediaId,
          'signal-2',
          'WORD',
          'PUBLISHED',
          '2026-07-23T00:00:00.000Z',
        );
        const thirdSignalVocabulary = await insertVocabulary(
          client,
          mediaId,
          'signal-3',
          'WORD',
          'PUBLISHED',
          '2026-07-24T00:00:00.000Z',
        );
        const hiddenSharedVocabulary = await insertVocabulary(
          client,
          mediaId,
          'hidden-shared',
          'WORD',
          'HIDDEN',
          '2026-07-28T00:00:00.000Z',
        );

        const attemptedQuestion = await insertQuestion(
          client,
          typeAVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-20T00:00:00.000Z',
        );
        await attachTargetVocabulary(
          client,
          mediaId,
          attemptedQuestion.versionId,
          attemptedTarget,
          '첫 오답 X',
        );
        const currentVersionId = randomUUID();
        const currentOptionId = randomUUID();
        await client.query(
          `update question_versions
           set status = 'RETIRED'
           where id = $1`,
          [attemptedQuestion.versionId],
        );
        await client.query(
          `insert into question_versions (
             id, question_id, version, type_version_id, difficulty, status,
             validation_status, validated_at, published_at
           ) values ($1, $2, 2, $3, 2, 'PUBLISHED', 'PASSED', $4, $4)`,
          [
            currentVersionId,
            attemptedQuestion.id,
            typeBVersionId,
            '2026-07-25T00:00:00.000Z',
          ],
        );
        await client.query(
          `insert into question_options (
             id, question_version_id, sentence_version_id, position, is_correct
           ) values ($1, $2, $3, 0, true)`,
          [currentOptionId, currentVersionId, baseSentenceVersionId],
        );
        await attachTargetVocabulary(
          client,
          mediaId,
          currentVersionId,
          currentTarget,
          '현재 게시 Y',
        );
        await client.query(
          `update questions
           set current_published_version_id = $2
           where id = $1`,
          [attemptedQuestion.id, currentVersionId],
        );

        const savedHiddenSource = await insertQuestion(
          client,
          typeBVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-24T00:00:00.000Z',
        );
        await attachTargetVocabulary(
          client,
          mediaId,
          savedHiddenSource.versionId,
          hiddenSharedVocabulary,
          '숨김 source',
        );
        const sameAttemptedTypeQuestion = await insertQuestion(
          client,
          typeAVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-23T00:00:00.000Z',
        );
        const hiddenSharedTarget = await insertQuestion(
          client,
          typeBVersionId,
          baseSentenceVersionId,
          'PUBLISHED',
          '2026-07-28T00:00:00.000Z',
        );
        await attachTargetVocabulary(
          client,
          mediaId,
          hiddenSharedTarget.versionId,
          hiddenSharedVocabulary,
          '숨김 target',
        );

        await client.query(
          `insert into question_attempts (
             id, user_id, question_id, question_version_id, attempt_no,
             selected_option_id, client_attempt_id, duration_ms,
             is_correct, submitted_at
           ) values ($1, $2, $3, $4, 1, $5, $6, 1000, false, now())`,
          [
            randomUUID(),
            firstUserId,
            attemptedQuestion.id,
            attemptedQuestion.versionId,
            attemptedQuestion.optionId,
            randomUUID(),
          ],
        );
        await client.query(
          `insert into saved_questions (user_id, question_id, saved_at)
           values ($1, $3, now()), ($1, $4, now()), ($2, $3, now())`,
          [
            firstUserId,
            secondUserId,
            savedHiddenSource.id,
            attemptedQuestion.id,
          ],
        );

        const firstWordbookId = randomUUID();
        const secondWordbookId = randomUUID();
        await client.query(
          `insert into wordbooks (id, user_id, name, created_at, updated_at)
           values
             ($1, $3, '첫 사용자 신호', now(), now()),
             ($2, $4, '둘째 사용자 신호', now(), now())`,
          [firstWordbookId, secondWordbookId, firstUserId, secondUserId],
        );
        await client.query(
          `insert into wordbook_items (wordbook_id, vocabulary_id, added_at)
           values
             ($1, $3, now()), ($1, $4, now()),
             ($2, $5, now()), ($2, $6, now()), ($2, $3, now()),
             ($2, $4, now()), ($2, $7, now())`,
          [
            firstWordbookId,
            secondWordbookId,
            firstSignalVocabulary.id,
            secondSignalVocabulary.id,
            attemptedTarget.id,
            currentTarget.id,
            thirdSignalVocabulary.id,
          ],
        );

        const query = new DrizzleRecommendationQuery(
          drizzle(client, { schema }),
        );
        const firstUser = await query.getForUser(firstUserId);
        expect(firstUser.mode).toBe('PERSONALIZED');
        expect(firstUser.meaningfulSignalCount).toBe(5);
        expect(
          firstUser.questions.find(
            ({ questionId }) => questionId === sameAttemptedTypeQuestion.id,
          )?.reasonCode,
        ).toBe('SIMILAR_QUESTION_TYPE');
        expect(
          firstUser.vocabularies.find(({ id }) => id === attemptedTarget.id)
            ?.reasonCode,
        ).toBe('FIRST_INCORRECT_QUESTION_VOCABULARY');
        expect(
          firstUser.vocabularies.find(({ id }) => id === currentTarget.id),
        ).toBeUndefined();

        const secondUser = await query.getForUser(secondUserId);
        expect(secondUser.mode).toBe('PERSONALIZED');
        expect(
          secondUser.questions.find(
            ({ questionId }) => questionId === hiddenSharedTarget.id,
          )?.reasonCode,
        ).toBe('RECENTLY_PUBLISHED');
      } finally {
        await client.query('rollback');
        client.release();
      }
    });
  },
);

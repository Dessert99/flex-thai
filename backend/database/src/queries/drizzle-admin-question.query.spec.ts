/** 관리자 문제 모든 상태 목록·상세의 stable projection을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../schema/index.js';
import {
  questionBlockSentences,
  questionBlocks,
  questionOptions,
  questionVersionTags,
  questions,
  questionVersions,
} from '../schema/index.js';
import { DrizzleAdminQuestionQuery } from './drizzle-admin-question.query.js';

type QueryResult = Array<Record<string, unknown>>;

const createSelectFake = (input: QueryResult[]) => {
  const results = [...input];
  const calls: Array<{
    fields: Record<string, unknown>;
    from?: unknown;
    orderBy: unknown[];
    limit?: number;
    offset?: number;
  }> = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call = { fields, orderBy: [] } as (typeof calls)[number];
    calls.push(call);
    const consume = () => results.shift() ?? [];
    const chain = {
      from: vi.fn((table: unknown) => {
        call.from = table;
        return chain;
      }),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      groupBy: vi.fn(() => chain),
      as: vi.fn(() => chain),
      orderBy: vi.fn((...orderBy: unknown[]) => {
        call.orderBy = orderBy;
        return chain;
      }),
      limit: vi.fn((limit: number) => {
        call.limit = limit;
        return chain;
      }),
      offset: vi.fn((offset: number) => {
        call.offset = offset;
        return Promise.resolve(consume());
      }),
      then: (
        resolve: (value: QueryResult) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(consume()).then(resolve, reject),
    };
    return chain;
  });
  return { calls, database: { select } };
};

const createdAt = new Date('2026-07-24T00:00:00.000Z');
const updatedAt = new Date('2026-07-24T01:00:00.000Z');

describe('DrizzleAdminQuestionQuery 목록', () => {
  it('모든 상태 필터와 stable latest version·count page를 반환한다', async () => {
    const fake = createSelectFake([
      [{ totalItems: 2 }],
      [
        {
          questionId: 'question-2',
          status: 'HIDDEN',
          currentPublishedVersionId: 'version-2',
          latestVersion: 3,
          latestVersionId: 'version-3',
          latestVersionStatus: 'DRAFT',
          validationStatus: 'FAILED',
          questionTypeSlug: 'listening-dialogue',
          difficulty: 4,
          updatedAt,
        },
        {
          questionId: 'question-1',
          status: 'DRAFT',
          currentPublishedVersionId: null,
          latestVersion: 1,
          latestVersionId: 'version-1',
          latestVersionStatus: 'DRAFT',
          validationStatus: 'PENDING',
          questionTypeSlug: 'reading-standard',
          difficulty: 2,
          updatedAt: createdAt,
        },
      ],
    ]);
    const query = new DrizzleAdminQuestionQuery(fake.database as never);

    await expect(
      query.list({
        status: 'HIDDEN',
        versionStatus: 'DRAFT',
        validationStatus: 'FAILED',
        questionTypeSlug: 'listening-dialogue',
        skill: 'LISTENING',
        difficulty: 4,
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual({
      items: [
        {
          questionId: 'question-2',
          status: 'HIDDEN',
          currentPublishedVersionId: 'version-2',
          latestVersion: 3,
          latestVersionId: 'version-3',
          latestVersionStatus: 'DRAFT',
          validationStatus: 'FAILED',
          questionTypeSlug: 'listening-dialogue',
          difficulty: 4,
          updatedAt,
        },
        {
          questionId: 'question-1',
          status: 'DRAFT',
          currentPublishedVersionId: null,
          latestVersion: 1,
          latestVersionId: 'version-1',
          latestVersionStatus: 'DRAFT',
          validationStatus: 'PENDING',
          questionTypeSlug: 'reading-standard',
          difficulty: 2,
          updatedAt: createdAt,
        },
      ],
      page: {
        page: 2,
        pageSize: 10,
        totalItems: 2,
        totalPages: 1,
      },
    });
    const questionCalls = fake.calls.filter(({ from }) => from === questions);
    expect(questionCalls).toHaveLength(2);
    expect(questionCalls[1]).toMatchObject({
      from: questions,
      limit: 10,
      offset: 10,
    });
    expect(questionCalls[1]?.orderBy).toHaveLength(2);
    expect(Object.keys(questionCalls[1]!.fields)).not.toEqual(
      expect.arrayContaining([
        'storageKey',
        'requestHash',
        'referenceMap',
        'isCorrect',
      ]),
    );
  });
});

describe('DrizzleAdminQuestionQuery 상세', () => {
  it('모든 버전과 validation·block·option 정답 ID를 stable order로 반환한다', async () => {
    const fake = createSelectFake([
      [
        {
          questionId: 'question-id',
          status: 'HIDDEN',
          currentPublishedVersionId: 'version-2',
          createdAt,
          updatedAt,
        },
      ],
      [
        {
          id: 'version-2',
          version: 2,
          status: 'PUBLISHED',
          validationStatus: 'PASSED',
          validationIssues: [],
          validatedAt: updatedAt,
          typeVersionId: 'type-version-id',
          questionTypeSlug: 'reading-standard',
          questionTypeVersion: 1,
          skill: 'READING',
          template: 'STANDARD_CHOICE',
          difficulty: 2,
          topicId: 'topic-id',
          topicSlug: 'general',
          topicDisplayName: '일반',
          createdAt,
          publishedAt: updatedAt,
        },
        {
          id: 'version-1',
          version: 1,
          status: 'RETIRED',
          validationStatus: 'FAILED',
          validationIssues: [{ path: 'options', code: 'OPTION_COUNT_INVALID' }],
          validatedAt: createdAt,
          typeVersionId: 'type-version-id',
          questionTypeSlug: 'reading-standard',
          questionTypeVersion: 1,
          skill: 'READING',
          template: 'STANDARD_CHOICE',
          difficulty: 2,
          topicId: 'topic-id',
          topicSlug: 'general',
          topicDisplayName: '일반',
          createdAt,
          publishedAt: createdAt,
        },
      ],
      [
        {
          id: 'block-2',
          questionVersionId: 'version-2',
          kind: 'QUESTION',
          displayMode: 'TEXT',
          position: 0,
        },
      ],
      [
        {
          blockId: 'block-2',
          sentenceVersionId: 'sentence-version-id',
          position: 0,
          speaker: null,
        },
      ],
      [
        {
          id: 'wrong-option',
          questionVersionId: 'version-2',
          sentenceVersionId: 'sentence-2',
          position: 1,
          isCorrect: false,
        },
        {
          id: 'correct-option',
          questionVersionId: 'version-2',
          sentenceVersionId: 'sentence-1',
          position: 0,
          isCorrect: true,
        },
        {
          id: 'retired-correct-option',
          questionVersionId: 'version-1',
          sentenceVersionId: 'sentence-3',
          position: 0,
          isCorrect: true,
        },
      ],
      [
        {
          questionVersionId: 'version-2',
          tagId: 'tag-id',
          tagSlug: 'grammar',
          tagDisplayName: '문법',
        },
      ],
    ]);
    const query = new DrizzleAdminQuestionQuery(fake.database as never);

    const detail = await query.findById('question-id');

    expect(detail).toMatchObject({
      questionId: 'question-id',
      status: 'HIDDEN',
      versions: [
        {
          id: 'version-2',
          version: 2,
          validation: {
            status: 'PASSED',
            issues: [],
            validatedAt: updatedAt,
          },
          topic: { id: 'topic-id', slug: 'general', displayName: '일반' },
          tags: [{ id: 'tag-id', slug: 'grammar', displayName: '문법' }],
          blocks: [
            {
              id: 'block-2',
              sentences: [
                {
                  sentenceVersionId: 'sentence-version-id',
                  position: 0,
                },
              ],
            },
          ],
          options: [
            {
              id: 'correct-option',
              sentenceVersionId: 'sentence-1',
              position: 0,
            },
            {
              id: 'wrong-option',
              sentenceVersionId: 'sentence-2',
              position: 1,
            },
          ],
          correctOptionId: 'correct-option',
        },
        {
          id: 'version-1',
          version: 1,
          validation: {
            status: 'FAILED',
            issues: [{ path: 'options', code: 'OPTION_COUNT_INVALID' }],
            validatedAt: createdAt,
          },
          topic: { id: 'topic-id', slug: 'general', displayName: '일반' },
          tags: [],
          blocks: [],
          options: [
            {
              id: 'retired-correct-option',
              sentenceVersionId: 'sentence-3',
              position: 0,
            },
          ],
          correctOptionId: 'retired-correct-option',
        },
      ],
    });
    expect(fake.calls.map(({ from }) => from)).toEqual([
      questions,
      questionVersions,
      questionBlocks,
      questionBlockSentences,
      questionOptions,
      questionVersionTags,
    ]);
    for (const call of fake.calls) {
      expect(Object.keys(call.fields)).not.toEqual(
        expect.arrayContaining([
          'storageKey',
          'requestHash',
          'referenceMap',
          'actorSub',
        ]),
      );
    }
  });
});

const integrationDatabaseUrl =
  process.env.QUESTION_ADMIN_REPOSITORY_TEST_DATABASE_URL;

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleAdminQuestionQuery PostgreSQL 16 통합',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('QUESTION_ADMIN_REPOSITORY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      const version = await pool.query<{ serverVersionNum: string }>(
        `select current_setting('server_version_num') "serverVersionNum"`,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeGreaterThanOrEqual(
        160000,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeLessThan(170000);
    });

    afterAll(async () => {
      await pool.end();
    });

    it('all-status 필터와 version 상세를 실제 stable order·count로 반환한다', async () => {
      const typeId = randomUUID();
      const typeVersionId = randomUUID();
      const slug = `query-${randomUUID()}`;
      const mediaId = randomUUID();
      const sentenceId = randomUUID();
      const sentenceVersionId = randomUUID();
      const questionId = randomUUID();
      const otherQuestionId = randomUUID();
      const retiredVersionId = randomUUID();
      const draftVersionId = randomUUID();
      const otherVersionId = randomUUID();
      const retiredOptionId = randomUUID();
      const draftOptionId = randomUUID();
      await pool.query(
        `insert into question_types (id, slug, display_name, skill)
         values ($1, $2, 'Query Task 7', 'READING')`,
        [typeId, slug],
      );
      await pool.query(
        `insert into question_type_versions (
           id, question_type_id, version, template, option_count, decision_rules
         ) values ($1, $2, 1, 'STANDARD_CHOICE', 1, '{}'::jsonb)`,
        [typeVersionId, typeId],
      );
      await pool.query(
        `insert into media_assets (
           id, kind, storage_key, declared_mime_type, declared_size_bytes,
           declared_sha256, mime_type, size_bytes, sha256, status, ready_at
         ) values (
           $1, 'AUDIO', $2, 'audio/mpeg', 1, $3,
           'audio/mpeg', 1, $3, 'READY', now()
         )`,
        [mediaId, `audio/${mediaId}`, 'b'.repeat(64)],
      );
      await pool.query(`insert into thai_sentences (id) values ($1)`, [
        sentenceId,
      ]);
      await pool.query(
        `insert into thai_sentence_versions (
           id, sentence_id, version, original_text, translation_ko,
           pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, $2, 1, 'ก', '뜻', '꺼', '-', $3)`,
        [sentenceVersionId, sentenceId, mediaId],
      );
      await pool.query(
        `insert into questions (id, status, updated_at)
         values ($1, 'HIDDEN', '2026-07-24T02:00:00Z'),
                ($2, 'DRAFT', '2026-07-24T01:00:00Z')`,
        [questionId, otherQuestionId],
      );
      await pool.query(
        `insert into question_versions (
           id, question_id, version, type_version_id, difficulty, status,
           validation_status, validation_issues, validated_at, published_at
         ) values
           ($1, $2, 1, $3, 4, 'RETIRED',
            'PASSED', '[]'::jsonb, '2026-07-24T00:00:00Z',
            '2026-07-24T00:00:00Z'),
           ($4, $2, 2, $3, 4, 'DRAFT',
            'FAILED',
            '[{"path":"options","code":"OPTION_COUNT_INVALID"}]'::jsonb,
            '2026-07-24T01:00:00Z', null),
           ($5, $6, 1, $3, 4, 'DRAFT',
            'PENDING', '[]'::jsonb, null, null)`,
        [
          retiredVersionId,
          questionId,
          typeVersionId,
          draftVersionId,
          otherVersionId,
          otherQuestionId,
        ],
      );
      await pool.query(
        `insert into question_options (
           id, question_version_id, sentence_version_id, position, is_correct
         ) values
           ($1, $2, $3, 0, true),
           ($4, $5, $3, 0, true),
           ($6, $7, $3, 0, true)`,
        [
          retiredOptionId,
          retiredVersionId,
          sentenceVersionId,
          draftOptionId,
          draftVersionId,
          randomUUID(),
          otherVersionId,
        ],
      );
      const database = drizzle({ client: pool, schema });
      const query = new DrizzleAdminQuestionQuery(database);

      const list = await query.list({
        status: 'HIDDEN',
        versionStatus: 'DRAFT',
        validationStatus: 'FAILED',
        questionTypeSlug: slug,
        skill: 'READING',
        difficulty: 4,
        page: 1,
        pageSize: 20,
      });
      expect(list).toMatchObject({
        items: [
          {
            questionId,
            latestVersion: 2,
            latestVersionId: draftVersionId,
            latestVersionStatus: 'DRAFT',
            validationStatus: 'FAILED',
          },
        ],
        page: { totalItems: 1, totalPages: 1 },
      });

      const detail = await query.findById(questionId);
      expect(detail?.versions.map(({ id }) => id)).toEqual([
        draftVersionId,
        retiredVersionId,
      ]);
      expect(detail?.versions[0]).toMatchObject({
        validation: {
          status: 'FAILED',
          issues: [{ path: 'options', code: 'OPTION_COUNT_INVALID' }],
        },
        correctOptionId: draftOptionId,
      });
      expect(detail?.versions[1]).toMatchObject({
        validation: { status: 'PASSED', issues: [] },
        correctOptionId: retiredOptionId,
      });
      expect(detail).not.toHaveProperty('storageKey');
      expect(detail).not.toHaveProperty('requestHash');
      expect(detail?.versions[0]?.options[0]).not.toHaveProperty('isCorrect');
    });
  },
);

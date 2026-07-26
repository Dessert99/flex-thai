/** 학습 답안 transaction과 저장 연결의 SQL 경계·실제 동시성을 검증한다 */
import { randomUUID } from 'node:crypto';
import {
  LearningDomainError,
  QuestionAttemptService,
  SavedContentService,
} from '@flex-thia/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../schema/index.js';
import {
  questionAttempts,
  questionOptions,
  questions,
  savedQuestions,
  users,
} from '../schema/index.js';
import {
  DrizzleLearningRepository,
  LearningPersistenceError,
} from './drizzle-learning.repository.js';

type QueryResult = Array<Record<string, unknown>>;

interface SelectCall {
  fields: Record<string, unknown>;
  from?: unknown;
  joins: Array<{ kind: 'inner' | 'left'; table: unknown; condition: unknown }>;
  condition?: unknown;
  lockMode?: unknown;
}

interface InsertCall {
  table: unknown;
  values?: Record<string, unknown>;
  onConflictDoNothing: boolean;
}

interface DeleteCall {
  table: unknown;
  condition?: unknown;
}

const toSql = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as never);

const createFake = (options?: {
  selectResults?: QueryResult[];
  returningResults?: QueryResult[];
}) => {
  const selectResults = [...(options?.selectResults ?? [])];
  const returningResults = [...(options?.returningResults ?? [])];
  const events: string[] = [];
  const selectCalls: SelectCall[] = [];
  const insertCalls: InsertCall[] = [];
  const deleteCalls: DeleteCall[] = [];

  const select = vi.fn((fields: Record<string, unknown>) => {
    const call: SelectCall = { fields, joins: [] };
    selectCalls.push(call);
    const chain = {
      from: vi.fn((table: unknown) => {
        call.from = table;
        return chain;
      }),
      innerJoin: vi.fn((table: unknown, condition: unknown) => {
        call.joins.push({ kind: 'inner', table, condition });
        return chain;
      }),
      leftJoin: vi.fn((table: unknown, condition: unknown) => {
        call.joins.push({ kind: 'left', table, condition });
        return chain;
      }),
      where: vi.fn((condition: unknown) => {
        call.condition = condition;
        return chain;
      }),
      for: vi.fn((mode: unknown) => {
        call.lockMode = mode;
        events.push(`lock:${String(mode)}`);
        return chain;
      }),
      limit: vi.fn(() => {
        events.push('select');
        return Promise.resolve(selectResults.shift() ?? []);
      }),
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => {
    const call: InsertCall = { table, onConflictDoNothing: false };
    insertCalls.push(call);
    const returning = () => Promise.resolve(returningResults.shift() ?? []);
    return {
      values: vi.fn((values: Record<string, unknown>) => {
        call.values = values;
        return {
          onConflictDoNothing: vi.fn(() => {
            call.onConflictDoNothing = true;
            return Promise.resolve();
          }),
          returning: vi.fn(returning),
        };
      }),
    };
  });

  const remove = vi.fn((table: unknown) => {
    const call: DeleteCall = { table };
    deleteCalls.push(call);
    return {
      where: vi.fn((condition: unknown) => {
        call.condition = condition;
        return Promise.resolve();
      }),
    };
  });

  const transactionValue = { delete: remove, insert, select };
  const database = {
    delete: remove,
    insert,
    select,
    transaction: vi.fn(
      <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
        work(transactionValue),
    ),
  };

  return {
    database,
    deleteCalls,
    events,
    insertCalls,
    selectCalls,
  };
};

const activeUserRow = [{ id: 'user-id', status: 'ACTIVE' }];

describe('DrizzleLearningRepository transaction', () => {
  it('ACTIVE user row를 먼저 잠그고 callback 결과와 예외를 그대로 전달한다', async () => {
    const resultFake = createFake({ selectResults: [activeUserRow] });
    const resultRepository = new DrizzleLearningRepository(
      resultFake.database as never,
    );

    await expect(
      resultRepository.runInTransaction('user-id', () => {
        resultFake.events.push('callback');
        return Promise.resolve('result');
      }),
    ).resolves.toBe('result');
    expect(resultFake.events).toEqual(['lock:update', 'select', 'callback']);
    expect(resultFake.selectCalls[0]).toMatchObject({
      from: users,
      lockMode: 'update',
    });
    expect(toSql(resultFake.selectCalls[0]?.condition).params).toEqual([
      'user-id',
      'ACTIVE',
    ]);

    const errorFake = createFake({ selectResults: [activeUserRow] });
    const errorRepository = new DrizzleLearningRepository(
      errorFake.database as never,
    );
    const transactionError = new Error('transaction-failed');
    await expect(
      errorRepository.runInTransaction('user-id', () =>
        Promise.reject(transactionError),
      ),
    ).rejects.toBe(transactionError);
  });

  it('사용자가 없거나 비활성이면 안정적인 persistence error를 반환한다', async () => {
    for (const rows of [[], [{ id: 'user-id' }, { id: 'duplicate-id' }]]) {
      const fake = createFake({ selectResults: [rows] });
      const repository = new DrizzleLearningRepository(fake.database as never);
      const callback = vi.fn();

      await expect(
        repository.runInTransaction('user-id', callback),
      ).rejects.toMatchObject({
        code: 'LEARNING_PERSISTENCE_CONFLICT',
        operation: 'lockActiveUser',
      });
      expect(callback).not.toHaveBeenCalled();
    }
  });

  it('clientAttemptId 답안을 domain 원시 record로 복원한다', async () => {
    const submittedAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createFake({
      selectResults: [
        activeUserRow,
        [
          {
            id: 'attempt-id',
            userId: 'user-id',
            questionId: 'question-id',
            questionVersionId: 'version-id',
            attemptNo: 2,
            selectedOptionId: 'option-id',
            clientAttemptId: 'client-attempt-id',
            durationMs: 1_500,
            isCorrect: true,
            submittedAt,
          },
        ],
      ],
    });
    const repository = new DrizzleLearningRepository(fake.database as never);

    await repository.runInTransaction('user-id', async (transaction) => {
      await expect(
        transaction.findByClientAttemptId('user-id', 'client-attempt-id'),
      ).resolves.toEqual({
        id: 'attempt-id',
        userId: 'user-id',
        questionId: 'question-id',
        questionVersionId: 'version-id',
        attemptNo: 2,
        selectedOptionId: 'option-id',
        clientAttemptId: 'client-attempt-id',
        durationMs: 1_500,
        isCorrect: true,
        submittedAt,
      });
    });
    expect(fake.selectCalls[1]?.from).toBe(questionAttempts);
    expect(toSql(fake.selectCalls[1]?.condition).params).toEqual([
      'user-id',
      'client-attempt-id',
    ]);
  });

  it('문제·current version·요청 version·선택·정답 선택지를 한 snapshot으로 조립한다', async () => {
    const fake = createFake({
      selectResults: [
        activeUserRow,
        [
          {
            questionStatus: 'PUBLISHED',
            currentPublishedVersionId: 'version-id',
            questionVersionStatus: 'PUBLISHED',
            selectedOptionId: null,
            correctOptionId: 'correct-option-id',
          },
        ],
      ],
    });
    const repository = new DrizzleLearningRepository(fake.database as never);

    await repository.runInTransaction('user-id', async (transaction) => {
      await expect(
        transaction.loadSubmissionTarget(
          'question-id',
          'version-id',
          'option-from-other-version',
        ),
      ).resolves.toEqual({
        questionStatus: 'PUBLISHED',
        currentPublishedVersionId: 'version-id',
        questionVersionStatus: 'PUBLISHED',
        selectedOptionId: null,
        correctOptionId: 'correct-option-id',
      });
    });

    const targetCall = fake.selectCalls[1];
    expect(targetCall?.from).toBe(questions);
    expect(Object.keys(targetCall?.fields ?? {})).toEqual([
      'questionStatus',
      'currentPublishedVersionId',
      'questionVersionStatus',
      'selectedOptionId',
      'correctOptionId',
    ]);
    expect(targetCall?.joins).toHaveLength(3);
    expect(targetCall?.joins.map((join) => join.kind)).toEqual([
      'left',
      'left',
      'left',
    ]);
    expect(toSql(targetCall?.condition).params).toEqual(['question-id']);
    expect(
      targetCall?.joins.flatMap((join) => toSql(join.condition).params),
    ).toEqual(['version-id', 'option-from-other-version', true]);
  });

  it('잠금 뒤 다음 attemptNo를 계산하고 append-only column을 정확히 한 row 저장한다', async () => {
    const submittedAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createFake({
      selectResults: [activeUserRow, [{ nextAttemptNo: 3 }]],
      returningResults: [[{ id: 'attempt-id' }]],
    });
    const repository = new DrizzleLearningRepository(fake.database as never);
    const attempt = {
      id: 'attempt-id',
      userId: 'user-id',
      questionId: 'question-id',
      questionVersionId: 'version-id',
      attemptNo: 3,
      selectedOptionId: 'option-id',
      clientAttemptId: 'client-attempt-id',
      durationMs: 1_500,
      isCorrect: false,
      submittedAt,
    };

    await repository.runInTransaction('user-id', async (transaction) => {
      await expect(
        transaction.readNextAttemptNo('user-id', 'question-id'),
      ).resolves.toBe(3);
      await expect(transaction.insertAttempt(attempt)).resolves.toBeUndefined();
    });

    expect(fake.selectCalls[1]?.from).toBe(questionAttempts);
    expect(toSql(fake.selectCalls[1]?.condition).params).toEqual([
      'user-id',
      'question-id',
    ]);
    expect(fake.insertCalls).toEqual([
      {
        table: questionAttempts,
        values: attempt,
        onConflictDoNothing: false,
      },
    ]);
  });

  it('예상하지 못한 조회·insert row 수를 안정적인 persistence error로 바꾼다', async () => {
    const fake = createFake({
      selectResults: [
        activeUserRow,
        [{ nextAttemptNo: 1 }, { nextAttemptNo: 2 }],
      ],
    });
    const repository = new DrizzleLearningRepository(fake.database as never);

    await expect(
      repository.runInTransaction('user-id', (transaction) =>
        transaction.readNextAttemptNo('user-id', 'question-id'),
      ),
    ).rejects.toBeInstanceOf(LearningPersistenceError);

    const insertFake = createFake({
      selectResults: [activeUserRow],
      returningResults: [[]],
    });
    const insertRepository = new DrizzleLearningRepository(
      insertFake.database as never,
    );
    await expect(
      insertRepository.runInTransaction('user-id', (transaction) =>
        transaction.insertAttempt({
          id: 'attempt-id',
          userId: 'user-id',
          questionId: 'question-id',
          questionVersionId: 'version-id',
          attemptNo: 1,
          selectedOptionId: 'option-id',
          clientAttemptId: 'client-attempt-id',
          durationMs: 0,
          isCorrect: true,
          submittedAt: new Date('2026-07-24T00:00:00.000Z'),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'LEARNING_PERSISTENCE_CONFLICT',
      operation: 'insertAttempt',
    });
  });

  it('퇴역·무효화 여부와 무관하게 historical version의 정답을 복원한다', async () => {
    const fake = createFake({
      selectResults: [
        activeUserRow,
        [{ correctOptionId: 'correct-option-id' }],
      ],
    });
    const repository = new DrizzleLearningRepository(fake.database as never);

    await repository.runInTransaction('user-id', async (transaction) => {
      await expect(
        transaction.loadCorrectOptionId('historical-version-id'),
      ).resolves.toBe('correct-option-id');
    });

    const correctOptionCall = fake.selectCalls[1];
    expect(correctOptionCall?.from).toBe(questionOptions);
    expect(correctOptionCall?.joins).toHaveLength(0);
    expect(toSql(correctOptionCall?.condition).params).toEqual([
      'historical-version-id',
      true,
    ]);
  });
});

describe('DrizzleLearningRepository 저장 콘텐츠', () => {
  it('문제와 current version 모두 PUBLISHED일 때만 가용하다', async () => {
    const availableFake = createFake({
      selectResults: [[{ id: 'question-id' }]],
    });
    const availableRepository = new DrizzleLearningRepository(
      availableFake.database as never,
    );
    await expect(
      availableRepository.isQuestionAvailable('question-id'),
    ).resolves.toBe(true);

    const call = availableFake.selectCalls[0];
    expect(call?.from).toBe(questions);
    expect(call?.joins).toHaveLength(1);
    expect(call?.joins[0]?.kind).toBe('inner');
    expect(toSql(call?.condition).params).toEqual([
      'question-id',
      'PUBLISHED',
      'PUBLISHED',
    ]);

    const unavailableFake = createFake({ selectResults: [[]] });
    const unavailableRepository = new DrizzleLearningRepository(
      unavailableFake.database as never,
    );
    await expect(
      unavailableRepository.isQuestionAvailable('question-id'),
    ).resolves.toBe(false);
  });

  it('저장은 conflict를 무시하고 삭제는 0 row도 반복 허용한다', async () => {
    const savedAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createFake();
    const repository = new DrizzleLearningRepository(fake.database as never);

    await repository.saveQuestion('user-id', 'question-id', savedAt);
    await repository.saveQuestion('user-id', 'question-id', savedAt);
    await repository.removeQuestion('user-id', 'question-id');
    await repository.removeQuestion('user-id', 'question-id');

    expect(fake.insertCalls).toEqual([
      {
        table: savedQuestions,
        values: { userId: 'user-id', questionId: 'question-id', savedAt },
        onConflictDoNothing: true,
      },
      {
        table: savedQuestions,
        values: { userId: 'user-id', questionId: 'question-id', savedAt },
        onConflictDoNothing: true,
      },
    ]);
    expect(fake.deleteCalls.map((call) => call.table)).toEqual([
      savedQuestions,
      savedQuestions,
    ]);
    expect(toSql(fake.deleteCalls[0]?.condition).params).toEqual([
      'user-id',
      'question-id',
    ]);
  });
});

interface IntegrationFixture {
  userId: string;
  questionId: string;
  questionVersionId: string;
  otherVersionId: string;
  selectedOptionId: string;
  correctOptionId: string;
  otherVersionOptionId: string;
  vocabularyId: string;
}

const integrationDatabaseUrl =
  process.env.LEARNING_REPOSITORY_TEST_DATABASE_URL;

const createIntegrationFixture = async (
  pool: Pool,
): Promise<IntegrationFixture> => {
  const ids = {
    userId: randomUUID(),
    mediaId: randomUUID(),
    sentenceId: randomUUID(),
    sentenceVersionId: randomUUID(),
    questionTypeId: randomUUID(),
    typeVersionId: randomUUID(),
    questionId: randomUUID(),
    questionVersionId: randomUUID(),
    otherVersionId: randomUUID(),
    selectedOptionId: randomUUID(),
    correctOptionId: randomUUID(),
    otherVersionOptionId: randomUUID(),
    vocabularyId: randomUUID(),
  };
  const sha256 = 'a'.repeat(64);

  await pool.query(
    `insert into users (id, cognito_sub, email, status)
     values ($1, $2, $3, 'ACTIVE')`,
    [ids.userId, `sub-${ids.userId}`, `${ids.userId}@example.com`],
  );
  await pool.query(
    `insert into media_assets (
       id, storage_key, declared_mime_type, declared_size_bytes,
       declared_sha256, mime_type, size_bytes, sha256, status, ready_at
     ) values ($1, $2, 'audio/mpeg', 1, $3, 'audio/mpeg', 1, $3, 'READY', now())`,
    [ids.mediaId, `audio/${ids.mediaId}`, sha256],
  );
  await pool.query(`insert into thai_sentences (id) values ($1)`, [
    ids.sentenceId,
  ]);
  await pool.query(
    `insert into thai_sentence_versions (
       id, sentence_id, version, original_text, translation_ko,
       pronunciation_ko, tone_marks, media_asset_id
     ) values ($1, $2, 1, 'ก', '뜻', '꼬', '-', $3)`,
    [ids.sentenceVersionId, ids.sentenceId, ids.mediaId],
  );
  await pool.query(
    `insert into question_types (id, slug, display_name, skill)
     values ($1, $2, '통합 테스트', 'READING')`,
    [ids.questionTypeId, `integration-${ids.questionTypeId}`],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 2, '{}')`,
    [ids.typeVersionId, ids.questionTypeId],
  );
  await pool.query(`insert into questions (id) values ($1)`, [ids.questionId]);
  await pool.query(
    `insert into question_versions (
       id, question_id, version, type_version_id, difficulty,
       status, validation_status, validation_issues, published_at
     ) values
       ($1, $2, 1, $3, 3, 'PUBLISHED', 'PASSED', '[]', now()),
       ($4, $2, 2, $3, 3, 'RETIRED', 'PASSED', '[]', now())`,
    [
      ids.questionVersionId,
      ids.questionId,
      ids.typeVersionId,
      ids.otherVersionId,
    ],
  );
  await pool.query(
    `insert into question_options (
       id, question_version_id, sentence_version_id, position, is_correct
     ) values
       ($1, $4, $5, 0, false),
       ($2, $4, $5, 1, true),
       ($3, $6, $5, 0, true)`,
    [
      ids.selectedOptionId,
      ids.correctOptionId,
      ids.otherVersionOptionId,
      ids.questionVersionId,
      ids.sentenceVersionId,
      ids.otherVersionId,
    ],
  );
  await pool.query(
    `update questions
       set status = 'PUBLISHED', current_published_version_id = $2
     where id = $1`,
    [ids.questionId, ids.questionVersionId],
  );
  await pool.query(
    `insert into vocabularies (
       id, thai, normalized_thai, kind, status
     ) values ($1, $2, $2, 'WORD', 'PUBLISHED')`,
    [ids.vocabularyId, `คำ-${ids.vocabularyId}`],
  );

  return {
    userId: ids.userId,
    questionId: ids.questionId,
    questionVersionId: ids.questionVersionId,
    otherVersionId: ids.otherVersionId,
    selectedOptionId: ids.selectedOptionId,
    correctOptionId: ids.correctOptionId,
    otherVersionOptionId: ids.otherVersionOptionId,
    vocabularyId: ids.vocabularyId,
  };
};

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleLearningRepository PostgreSQL 16 통합',
  () => {
    let pool: Pool;
    let repository: DrizzleLearningRepository;

    beforeAll(() => {
      if (!integrationDatabaseUrl) {
        throw new Error('LEARNING_REPOSITORY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      repository = new DrizzleLearningRepository(
        drizzle({ client: pool, schema }),
      );
    });

    afterAll(async () => {
      await pool.end();
    });

    it('서로 다른 첫 제출 두 개를 attemptNo 1과 2로 직렬화한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new QuestionAttemptService(repository);

      const results = await Promise.all([
        service.submit({
          userId: fixture.userId,
          questionId: fixture.questionId,
          questionVersionId: fixture.questionVersionId,
          clientAttemptId: randomUUID(),
          durationMs: 100,
          selectedOptionId: fixture.selectedOptionId,
        }),
        service.submit({
          userId: fixture.userId,
          questionId: fixture.questionId,
          questionVersionId: fixture.questionVersionId,
          clientAttemptId: randomUUID(),
          durationMs: 200,
          selectedOptionId: fixture.correctOptionId,
        }),
      ]);

      expect(results.map((result) => result.attempt.attemptNo).sort()).toEqual([
        1, 2,
      ]);
      const count = await pool.query<{ count: string }>(
        `select count(*) from question_attempts
         where user_id = $1 and question_id = $2`,
        [fixture.userId, fixture.questionId],
      );
      expect(count.rows[0]?.count).toBe('2');
    });

    it('같은 client ID·payload 동시 제출은 한 row와 같은 결과를 반환한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new QuestionAttemptService(repository);
      const input = {
        userId: fixture.userId,
        questionId: fixture.questionId,
        questionVersionId: fixture.questionVersionId,
        selectedOptionId: fixture.selectedOptionId,
        clientAttemptId: randomUUID(),
        durationMs: 300,
      };

      const [first, second] = await Promise.all([
        service.submit(input),
        service.submit(input),
      ]);

      expect(second).toEqual(first);
      const count = await pool.query<{ count: string }>(
        `select count(*) from question_attempts
         where user_id = $1 and client_attempt_id = $2`,
        [fixture.userId, input.clientAttemptId],
      );
      expect(count.rows[0]?.count).toBe('1');
    });

    it('같은 client ID의 다른 payload는 한 row를 유지하고 충돌한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new QuestionAttemptService(repository);
      const clientAttemptId = randomUUID();
      const settled = await Promise.allSettled([
        service.submit({
          userId: fixture.userId,
          questionId: fixture.questionId,
          questionVersionId: fixture.questionVersionId,
          selectedOptionId: fixture.selectedOptionId,
          clientAttemptId,
          durationMs: 400,
        }),
        service.submit({
          userId: fixture.userId,
          questionId: fixture.questionId,
          questionVersionId: fixture.questionVersionId,
          selectedOptionId: fixture.correctOptionId,
          clientAttemptId,
          durationMs: 401,
        }),
      ]);

      expect(
        settled.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = settled.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: { code: 'ATTEMPT_IDEMPOTENCY_CONFLICT' },
      });
      const count = await pool.query<{ count: string }>(
        `select count(*) from question_attempts
         where user_id = $1 and client_attempt_id = $2`,
        [fixture.userId, clientAttemptId],
      );
      expect(count.rows[0]?.count).toBe('1');
      const stored = await pool.query<{
        selectedOptionId: string;
        durationMs: string;
      }>(
        `select selected_option_id "selectedOptionId", duration_ms "durationMs"
           from question_attempts
          where user_id = $1 and client_attempt_id = $2`,
        [fixture.userId, clientAttemptId],
      );
      const fulfilled = settled.find((result) => result.status === 'fulfilled');
      if (!fulfilled || fulfilled.status !== 'fulfilled') {
        throw new Error('FULFILLED_ATTEMPT_REQUIRED');
      }
      expect(stored.rows[0]).toEqual({
        selectedOptionId: fulfilled.value.attempt.selectedOptionId,
        durationMs: String(fulfilled.value.attempt.durationMs),
      });
    });

    it('숨김·무효화된 문제에는 새 답안을 남기지 않는다', async () => {
      const hidden = await createIntegrationFixture(pool);
      const invalidated = await createIntegrationFixture(pool);
      const service = new QuestionAttemptService(repository);
      await pool.query(`update questions set status = 'HIDDEN' where id = $1`, [
        hidden.questionId,
      ]);
      await pool.query(
        `update question_versions set status = 'INVALIDATED' where id = $1`,
        [invalidated.questionVersionId],
      );

      for (const fixture of [hidden, invalidated]) {
        await expect(
          service.submit({
            userId: fixture.userId,
            questionId: fixture.questionId,
            questionVersionId: fixture.questionVersionId,
            selectedOptionId: fixture.selectedOptionId,
            clientAttemptId: randomUUID(),
            durationMs: 500,
          }),
        ).rejects.toBeInstanceOf(LearningDomainError);
      }
      const count = await pool.query<{ count: string }>(
        `select count(*) from question_attempts
         where user_id = any($1::uuid[])`,
        [[hidden.userId, invalidated.userId]],
      );
      expect(count.rows[0]?.count).toBe('0');
    });

    it('무효화 뒤 같은 제출을 재전송해 historical 정답 feedback을 복원한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new QuestionAttemptService(repository);
      const input = {
        userId: fixture.userId,
        questionId: fixture.questionId,
        questionVersionId: fixture.questionVersionId,
        selectedOptionId: fixture.selectedOptionId,
        clientAttemptId: randomUUID(),
        durationMs: 600,
      };
      const first = await service.submit(input);
      await pool.query(
        `update question_versions set status = 'INVALIDATED' where id = $1`,
        [fixture.questionVersionId],
      );

      await expect(service.submit(input)).resolves.toEqual(first);
    });

    it('저장 PUT·DELETE를 문제 1·0개 연결로 멱등 처리한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new SavedContentService(repository);
      const savedAt = new Date('2026-07-24T00:00:00.000Z');

      await service.saveQuestion(fixture.userId, fixture.questionId, savedAt);
      await service.saveQuestion(fixture.userId, fixture.questionId, savedAt);
      const savedCount = await pool.query<{ questions: string }>(
        `select count(*) questions
           from saved_questions
          where user_id = $1`,
        [fixture.userId],
      );
      expect(savedCount.rows[0]).toEqual({ questions: '1' });

      await service.removeQuestion(fixture.userId, fixture.questionId);
      await service.removeQuestion(fixture.userId, fixture.questionId);
      const removedCount = await pool.query<{ questions: string }>(
        `select count(*) questions
           from saved_questions
          where user_id = $1`,
        [fixture.userId],
      );
      expect(removedCount.rows[0]).toEqual({ questions: '0' });
    });

    it('다른 version 선택지의 직접 insert를 composite FK가 거절한다', async () => {
      const fixture = await createIntegrationFixture(pool);

      await expect(
        pool.query(
          `insert into question_attempts (
             user_id, question_id, question_version_id, attempt_no,
             selected_option_id, client_attempt_id, duration_ms,
             is_correct, submitted_at
           ) values ($1, $2, $3, 1, $4, $5, 0, false, now())`,
          [
            fixture.userId,
            fixture.questionId,
            fixture.questionVersionId,
            fixture.otherVersionOptionId,
            randomUUID(),
          ],
        ),
      ).rejects.toMatchObject({
        constraint: 'question_attempts_selected_option_fk',
      });
    });
  },
);

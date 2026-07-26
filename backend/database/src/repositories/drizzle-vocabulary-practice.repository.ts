/** 단어 연습 세션 생성과 답안 lock·멱등·완료를 PostgreSQL transaction으로 구현한다 */
import { randomUUID } from 'node:crypto';
import type {
  CreateVocabularyPracticeInput,
  MaterializedPracticeQuestion,
  MaterializedPracticeSession,
  PracticeAnswerRecord,
  PracticeSessionRecord,
  SubmitPracticeAnswerInput,
  SubmitPracticeAnswerResult,
  VocabularyPracticeRepository,
} from '@flex-thia/domain';
import { sql, type SQL } from 'drizzle-orm';
import { DrizzleVocabularyPracticeQuery } from '../queries/drizzle-vocabulary-practice.query.js';

interface VocabularyPracticeTransaction {
  execute(query: SQL): Promise<unknown>;
}

interface VocabularyPracticeDatabase extends VocabularyPracticeTransaction {
  transaction<T>(
    work: (transaction: VocabularyPracticeTransaction) => Promise<T>,
  ): Promise<T>;
}

interface StoredQuestionRow {
  id: string;
  sessionId: string;
  position: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string | null;
  mediaAssetId: string | null;
  mode: MaterializedPracticeQuestion['mode'];
  promptText: string | null;
  audioStorageKey: string | null;
  options: MaterializedPracticeQuestion['options'];
  correctOptionId: string;
  cardSnapshot: MaterializedPracticeQuestion['card'];
}

interface ReplayRow extends StoredQuestionRow {
  answerId: string;
  answerSessionId: string;
  answerQuestionId: string;
  answerUserId: string;
  answerClientAnswerId: string;
  answerSelectedOptionId: string;
  answerSelectedLabelSnapshot: string;
  answerIsCorrect: boolean;
  answerAnsweredAt: Date;
  status: 'ACTIVE' | 'COMPLETED';
}

interface LockedQuestionRow extends StoredQuestionRow {
  status: 'ACTIVE' | 'COMPLETED';
  questionCount: number;
}

const rowsOf = <T>(result: unknown): T[] => {
  if (Array.isArray(result)) return result as T[];
  if (
    typeof result === 'object' &&
    result !== null &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as T[];
  }
  return [];
};

const toQuestion = (row: StoredQuestionRow): MaterializedPracticeQuestion => ({
  id: row.id,
  sessionId: row.sessionId,
  position: row.position,
  vocabularyId: row.vocabularyId,
  meaningId: row.meaningId,
  pronunciationId: row.pronunciationId,
  mediaAssetId: row.mediaAssetId,
  mode: row.mode,
  prompt:
    row.audioStorageKey === null
      ? { type: 'TEXT', text: row.promptText ?? '' }
      : { type: 'AUDIO', storageKey: row.audioStorageKey },
  options: row.options,
  correctOptionId: row.correctOptionId,
  card: row.cardSnapshot,
});

const toReplayAnswer = (row: ReplayRow): PracticeAnswerRecord => ({
  id: row.answerId,
  sessionId: row.answerSessionId,
  questionId: row.answerQuestionId,
  userId: row.answerUserId,
  clientAnswerId: row.answerClientAnswerId,
  selectedOptionId: row.answerSelectedOptionId,
  selectedLabelSnapshot: row.answerSelectedLabelSnapshot,
  isCorrect: row.answerIsCorrect,
  answeredAt: row.answerAnsweredAt,
});

const replayQuery = (userId: string, clientAnswerId: string): SQL => sql`
  select
    a.id as "answerId",
    a.session_id as "answerSessionId",
    a.question_id as "answerQuestionId",
    a.user_id as "answerUserId",
    a.client_answer_id as "answerClientAnswerId",
    a.selected_option_id as "answerSelectedOptionId",
    a.selected_label_snapshot as "answerSelectedLabelSnapshot",
    a.is_correct as "answerIsCorrect",
    a.answered_at as "answerAnsweredAt",
    q.id,
    q.session_id as "sessionId",
    q.position,
    q.vocabulary_id as "vocabularyId",
    q.meaning_id as "meaningId",
    q.pronunciation_id as "pronunciationId",
    q.media_asset_id as "mediaAssetId",
    q.mode,
    q.prompt_text as "promptText",
    q.audio_storage_key as "audioStorageKey",
    q.options,
    q.correct_option_id as "correctOptionId",
    q.card_snapshot as "cardSnapshot",
    s.status
  from vocabulary_practice_answers a
  join vocabulary_practice_questions q
    on q.session_id = a.session_id and q.id = a.question_id
  join vocabulary_practice_sessions s on s.id = a.session_id
  where a.user_id = ${userId} and a.client_answer_id = ${clientAnswerId}
  limit 1
`;

/** 도메인 port를 기능 전용 query와 PostgreSQL transaction으로 연결한다 */
export class DrizzleVocabularyPracticeRepository implements VocabularyPracticeRepository {
  private readonly query: DrizzleVocabularyPracticeQuery;

  constructor(
    private readonly database: VocabularyPracticeDatabase,
    query?: DrizzleVocabularyPracticeQuery,
    private readonly createId: () => string = randomUUID,
  ) {
    this.query = query ?? new DrizzleVocabularyPracticeQuery(database);
  }

  /** 출처 종류에 맞는 소유권·공개 음성 query를 실행한다 */
  loadSource(input: CreateVocabularyPracticeInput) {
    return input.source.type === 'WORDBOOK'
      ? this.query.loadWordbook(input.userId, input.source.wordbookId)
      : this.query.loadSearchSelection(
          input.userId,
          input.source.vocabularyIds,
        );
  }

  /** 세션과 모든 문항 snapshot을 한 transaction으로 생성한다 */
  createSession(
    input: MaterializedPracticeSession,
  ): Promise<PracticeSessionRecord> {
    if (input.sourceType === 'WORDBOOK' && input.sourceWordbookId === null) {
      throw new Error('PRACTICE_WORDBOOK_SOURCE_REQUIRED');
    }
    return this.database.transaction(async (transaction) => {
      const modes = sql.join(
        input.modes.map((mode) => sql`${mode}::vocabulary_practice_mode`),
        sql`, `,
      );
      await transaction.execute(sql`
        insert into vocabulary_practice_sessions (
          id, user_id, source_type, source_wordbook_id, source_label, modes,
          requested_question_count, question_order, status, question_count,
          started_at, completed_at
        ) values (
          ${input.id}, ${input.userId}, ${input.sourceType},
          ${input.sourceWordbookId}, ${input.sourceLabel},
          array[${modes}],
          ${input.requestedQuestionCount}, ${input.order}, 'ACTIVE',
          ${input.questionCount}, ${input.startedAt}, null
        )
      `);
      for (const question of input.questions) {
        const targetPronunciation =
          question.pronunciationId === null
            ? null
            : (question.card.pronunciations.find(
                ({ id }) => id === question.pronunciationId,
              ) ?? null);
        await transaction.execute(sql`
          insert into vocabulary_practice_questions (
            id, session_id, position, vocabulary_id, meaning_id,
            pronunciation_id, media_asset_id, mode, prompt_text,
            audio_storage_key, thai_snapshot, meaning_ko_snapshot,
            pronunciation_ko_snapshot, tone_marks_snapshot, options,
            correct_option_id, card_snapshot
          ) values (
            ${question.id}, ${question.sessionId}, ${question.position},
            ${question.vocabularyId}, ${question.meaningId},
            ${question.pronunciationId}, ${question.mediaAssetId},
            ${question.mode},
            ${question.prompt.type === 'TEXT' ? question.prompt.text : null},
            ${question.prompt.type === 'AUDIO' ? question.prompt.storageKey : null},
            ${question.card.thai},
            ${question.card.meanings.find(({ id }) => id === question.meaningId)?.meaningKo ?? ''},
            ${targetPronunciation?.pronunciationKo ?? null},
            ${targetPronunciation?.toneMarks ?? null},
            ${JSON.stringify(question.options)}::jsonb,
            ${question.correctOptionId},
            ${JSON.stringify(question.card)}::jsonb
          )
        `);
      }
      return {
        ...input,
        status: 'ACTIVE',
        completedAt: null,
        answers: [],
      };
    });
  }

  /** 사용자 소유 세션의 문항과 답안 진행을 반환한다 */
  getSession(userId: string, sessionId: string) {
    return this.query.getSession(userId, sessionId);
  }

  /** 동일 payload만 재생하고 새 답·완료를 session row lock으로 직렬화한다 */
  submitAnswer(
    input: SubmitPracticeAnswerInput,
  ): Promise<SubmitPracticeAnswerResult> {
    return this.database.transaction(async (transaction) => {
      // 서로 다른 세션도 같은 user/client 멱등 key로 직렬화한다.
      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`${input.userId}:${input.clientAnswerId}`}, 0)
        )
      `);
      const replayBeforeLock = await this.findReplay(transaction, input);
      if (replayBeforeLock) return replayBeforeLock;

      const lockResult = await transaction.execute(sql`
        select
          q.id,
          q.session_id as "sessionId",
          q.position,
          q.vocabulary_id as "vocabularyId",
          q.meaning_id as "meaningId",
          q.pronunciation_id as "pronunciationId",
          q.media_asset_id as "mediaAssetId",
          q.mode,
          q.prompt_text as "promptText",
          q.audio_storage_key as "audioStorageKey",
          q.options,
          q.correct_option_id as "correctOptionId",
          q.card_snapshot as "cardSnapshot",
          s.status,
          s.question_count as "questionCount"
        from vocabulary_practice_sessions s
        join vocabulary_practice_questions q on q.session_id = s.id
        where s.id = ${input.sessionId}
          and s.user_id = ${input.userId}
          and q.id = ${input.questionId}
        for update of s
      `);
      const [locked] = rowsOf<LockedQuestionRow>(lockResult);
      if (!locked) return { status: 'NOT_FOUND' };

      if (locked.status === 'COMPLETED') return { status: 'COMPLETED' };

      const answeredResult = await transaction.execute(sql`
        select id
        from vocabulary_practice_answers
        where session_id = ${input.sessionId}
          and question_id = ${input.questionId}
        limit 1
      `);
      if (rowsOf(answeredResult).length > 0) {
        return { status: 'ALREADY_ANSWERED' };
      }

      const selected = locked.options.find(
        ({ id }) => id === input.selectedOptionId,
      );
      if (!selected) return { status: 'INVALID_OPTION' };

      const answer: PracticeAnswerRecord = {
        id: this.createId(),
        sessionId: input.sessionId,
        questionId: input.questionId,
        userId: input.userId,
        clientAnswerId: input.clientAnswerId,
        selectedOptionId: input.selectedOptionId,
        selectedLabelSnapshot: selected.label,
        isCorrect: input.selectedOptionId === locked.correctOptionId,
        answeredAt: input.answeredAt,
      };
      await transaction.execute(sql`
        insert into vocabulary_practice_answers (
          id, session_id, question_id, user_id, client_answer_id,
          selected_option_id, selected_label_snapshot, is_correct, answered_at
        ) values (
          ${answer.id}, ${answer.sessionId}, ${answer.questionId},
          ${answer.userId}, ${answer.clientAnswerId},
          ${answer.selectedOptionId}, ${answer.selectedLabelSnapshot},
          ${answer.isCorrect}, ${answer.answeredAt}
        )
      `);
      const countResult = await transaction.execute(sql`
        select count(*)::integer as "answerCount"
        from vocabulary_practice_answers
        where session_id = ${input.sessionId}
      `);
      const answerCount =
        rowsOf<{ answerCount: number }>(countResult)[0]?.answerCount ?? 0;
      const sessionCompleted = answerCount >= locked.questionCount;
      if (sessionCompleted) {
        await transaction.execute(sql`
          update vocabulary_practice_sessions
          set status = 'COMPLETED', completed_at = ${input.answeredAt}
          where id = ${input.sessionId} and status = 'ACTIVE'
        `);
      }
      return {
        status: 'ANSWERED',
        answer,
        question: toQuestion(locked),
        sessionCompleted,
      };
    });
  }

  private async findReplay(
    transaction: VocabularyPracticeTransaction,
    input: SubmitPracticeAnswerInput,
  ): Promise<SubmitPracticeAnswerResult | null> {
    const result = await transaction.execute(
      replayQuery(input.userId, input.clientAnswerId),
    );
    const [row] = rowsOf<ReplayRow>(result);
    if (!row) return null;
    if (
      row.answerSessionId !== input.sessionId ||
      row.answerQuestionId !== input.questionId ||
      row.answerSelectedOptionId !== input.selectedOptionId
    ) {
      return { status: 'IDEMPOTENCY_CONFLICT' };
    }
    return {
      status: 'ANSWERED',
      answer: toReplayAnswer(row),
      question: toQuestion(row),
      sessionCompleted: row.status === 'COMPLETED',
    };
  }
}

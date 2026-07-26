/** 단어 연습 source와 materialized 세션 진행을 PostgreSQL read model로 조회한다 */
import type {
  PracticeAnswerRecord,
  PracticeMeaningCandidate,
  PracticeSessionRecord,
  PracticeSourceRecord,
} from '@flex-thia/domain';
import { sql, type SQL } from 'drizzle-orm';

interface VocabularyPracticeReadDatabase {
  execute(query: SQL): Promise<unknown>;
}

interface SessionRow {
  id: string;
  userId: string;
  sourceType: 'SEARCH_SELECTION' | 'WORDBOOK';
  sourceWordbookId: string | null;
  sourceLabel: string;
  modes: PracticeSessionRecord['modes'];
  requestedQuestionCount: number | null;
  questionOrder: 'RANDOM' | 'SOURCE';
  status: 'ACTIVE' | 'COMPLETED';
  questionCount: number;
  startedAt: Date;
  completedAt: Date | null;
}

interface QuestionRow {
  id: string;
  sessionId: string;
  position: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string | null;
  mediaAssetId: string | null;
  mode: PracticeSessionRecord['modes'][number];
  promptText: string | null;
  audioStorageKey: string | null;
  options: PracticeSessionRecord['questions'][number]['options'];
  correctOptionId: string;
  cardSnapshot: PracticeSessionRecord['questions'][number]['card'];
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

const candidateSelect = (
  vocabularyIds: string[] | null,
  wordbookId: string | null,
): SQL => sql`
  select
    v.id as "vocabularyId",
    v.thai as "thai",
    m.id as "meaningId",
    m.meaning_ko as "meaningKo",
    (
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'pronunciationKo', p.pronunciation_ko,
        'toneMarks', p.tone_marks,
        'mediaAssetId', a.id,
        'storageKey', a.storage_key
      ) order by p.id)
      from vocabulary_meaning_pronunciations mp
      join vocabulary_pronunciations p
        on p.id = mp.pronunciation_id
       and p.vocabulary_id = mp.vocabulary_id
      join media_assets a on a.id = p.media_asset_id and a.status = 'READY'
      where mp.meaning_id = m.id
    ) as "pronunciations",
    jsonb_build_object(
      'id', v.id,
      'thai', v.thai,
      'kind', v.kind,
      'meanings', (
        select jsonb_agg(jsonb_build_object(
          'id', cm.id,
          'meaningKo', cm.meaning_ko,
          'partOfSpeech', cm.part_of_speech,
          'difficulty', cm.difficulty,
          'contextNote', cm.context_note
        ) order by cm.id)
        from vocabulary_meanings cm
        where cm.vocabulary_id = v.id
      ),
      'pronunciations', (
        select jsonb_agg(jsonb_build_object(
          'id', cp.id,
          'pronunciationKo', cp.pronunciation_ko,
          'toneMarks', cp.tone_marks,
          'mediaAssetId', ca.id,
          'storageKey', ca.storage_key
        ) order by cp.id)
        from vocabulary_pronunciations cp
        join media_assets ca on ca.id = cp.media_asset_id and ca.status = 'READY'
        where cp.vocabulary_id = v.id
      ),
      'meaningPronunciations', (
        select jsonb_agg(jsonb_build_object(
          'meaningId', cmp.meaning_id,
          'pronunciationId', cmp.pronunciation_id
        ) order by cmp.meaning_id, cmp.pronunciation_id)
        from vocabulary_meaning_pronunciations cmp
        join vocabulary_pronunciations cpp
          on cpp.id = cmp.pronunciation_id
         and cpp.vocabulary_id = cmp.vocabulary_id
        join media_assets cpa
          on cpa.id = cpp.media_asset_id
         and cpa.status = 'READY'
        where cmp.vocabulary_id = v.id
      )
    ) as "card"
  from vocabularies v
  join vocabulary_meanings m on m.vocabulary_id = v.id
  ${wordbookId === null ? sql`` : sql`join wordbook_items wi on wi.vocabulary_id = v.id`}
  where v.status = 'PUBLISHED'
    ${vocabularyIds === null ? sql`` : sql`and v.id = any(${vocabularyIds}::uuid[])`}
    ${wordbookId === null ? sql`` : sql`and wi.wordbook_id = ${wordbookId}`}
    and exists (
      select 1
      from vocabulary_meaning_pronunciations emp
      join vocabulary_pronunciations ep
        on ep.id = emp.pronunciation_id
       and ep.vocabulary_id = emp.vocabulary_id
      join media_assets ea on ea.id = ep.media_asset_id and ea.status = 'READY'
      where emp.meaning_id = m.id
    )
  order by
    ${
      vocabularyIds === null
        ? sql`wi.added_at asc, v.id asc`
        : sql`array_position(${vocabularyIds}::uuid[], v.id), m.id asc`
    }
`;

/** 검색 선택·소유 단어장 source와 사용자 세션을 조회한다 */
export class DrizzleVocabularyPracticeQuery {
  constructor(private readonly database: VocabularyPracticeReadDatabase) {}

  /** 요청 ID 순서로 게시·준비 어의를 반환한다 */
  async loadSearchSelection(
    _userId: string,
    vocabularyIds: string[],
  ): Promise<PracticeSourceRecord> {
    const result = await this.database.execute(
      candidateSelect(vocabularyIds, null),
    );
    return {
      label: '공용 검색',
      candidates: rowsOf<PracticeMeaningCandidate>(result),
    };
  }

  /** 사용자 소유 단어장의 게시·준비 어의를 추가 순서로 반환한다 */
  async loadWordbook(
    userId: string,
    wordbookId: string,
  ): Promise<PracticeSourceRecord | null> {
    const ownerResult = await this.database.execute(sql`
      select name
      from wordbooks
      where id = ${wordbookId} and user_id = ${userId}
      limit 1
    `);
    const [wordbook] = rowsOf<{ name: string }>(ownerResult);
    if (!wordbook) return null;

    const candidateResult = await this.database.execute(
      candidateSelect(null, wordbookId),
    );
    return {
      label: wordbook.name,
      candidates: rowsOf<PracticeMeaningCandidate>(candidateResult),
    };
  }

  /** materialized 문항과 원시 답안을 함께 읽어 새로고침 진행을 복구한다 */
  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<PracticeSessionRecord | null> {
    const sessionResult = await this.database.execute(sql`
      select
        id,
        user_id as "userId",
        source_type as "sourceType",
        source_wordbook_id as "sourceWordbookId",
        source_label as "sourceLabel",
        modes,
        requested_question_count as "requestedQuestionCount",
        question_order as "questionOrder",
        status,
        question_count as "questionCount",
        started_at as "startedAt",
        completed_at as "completedAt"
      from vocabulary_practice_sessions
      where id = ${sessionId} and user_id = ${userId}
      limit 1
    `);
    const [session] = rowsOf<SessionRow>(sessionResult);
    if (!session) return null;

    const questionResult = await this.database.execute(sql`
      select
        id,
        session_id as "sessionId",
        position,
        vocabulary_id as "vocabularyId",
        meaning_id as "meaningId",
        pronunciation_id as "pronunciationId",
        media_asset_id as "mediaAssetId",
        mode,
        prompt_text as "promptText",
        audio_storage_key as "audioStorageKey",
        options,
        correct_option_id as "correctOptionId",
        card_snapshot as "cardSnapshot"
      from vocabulary_practice_questions
      where session_id = ${sessionId}
      order by position asc
    `);
    const answerResult = await this.database.execute(sql`
      select
        id,
        session_id as "sessionId",
        question_id as "questionId",
        user_id as "userId",
        client_answer_id as "clientAnswerId",
        selected_option_id as "selectedOptionId",
        selected_label_snapshot as "selectedLabelSnapshot",
        is_correct as "isCorrect",
        answered_at as "answeredAt"
      from vocabulary_practice_answers
      where session_id = ${sessionId} and user_id = ${userId}
      order by answered_at asc, id asc
    `);

    return {
      id: session.id,
      userId: session.userId,
      sourceType: session.sourceType,
      sourceWordbookId: session.sourceWordbookId,
      sourceLabel: session.sourceLabel,
      modes: session.modes,
      requestedQuestionCount: session.requestedQuestionCount,
      order: session.questionOrder,
      status: session.status,
      questionCount: session.questionCount,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      questions: rowsOf<QuestionRow>(questionResult).map((question) => ({
        id: question.id,
        sessionId: question.sessionId,
        position: question.position,
        vocabularyId: question.vocabularyId,
        meaningId: question.meaningId,
        pronunciationId: question.pronunciationId,
        mediaAssetId: question.mediaAssetId,
        mode: question.mode,
        prompt:
          question.audioStorageKey === null
            ? { type: 'TEXT', text: question.promptText ?? '' }
            : { type: 'AUDIO', storageKey: question.audioStorageKey },
        options: question.options,
        correctOptionId: question.correctOptionId,
        card: question.cardSnapshot,
      })),
      answers: rowsOf<PracticeAnswerRecord>(answerResult),
    };
  }
}

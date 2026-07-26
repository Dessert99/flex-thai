/** 원시 학습 기록에서 현재 공개 문제·어휘 추천을 요청 시 계산한다 */
import { sql, type SQL } from 'drizzle-orm';

interface RecommendationReadDatabase {
  execute(query: SQL): Promise<unknown>;
}

/** 추천 계산에 필요한 현재 게시 문제와 기여 신호 */
export interface QuestionRecommendationCandidate {
  questionId: string;
  questionVersionId: string;
  questionTypeId: string;
  questionTypeSlug: string;
  questionTypeDisplayName: string;
  skill: 'READING' | 'LISTENING';
  difficulty: number;
  publishedAt: Date | string;
  saved: boolean;
  firstIncorrect: boolean;
  practiceIncorrectVocabulary: boolean;
  sameIncorrectType: boolean;
  savedQuestionVocabulary: boolean;
  firstCorrect: boolean;
}

/** 추천 계산에 필요한 현재 게시 어휘와 기여 신호 */
export interface VocabularyRecommendationCandidate {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  publishedAt: Date | string;
  inWordbook: boolean;
  practiceIncorrect: boolean;
  firstIncorrectQuestion: boolean;
  savedQuestion: boolean;
}

type QuestionReasonCode =
  | 'RECENTLY_PUBLISHED'
  | 'SAVED_QUESTION'
  | 'FIRST_INCORRECT_RETRY'
  | 'PRACTICE_MISSED_VOCABULARY'
  | 'SIMILAR_QUESTION_TYPE'
  | 'SAVED_QUESTION_VOCABULARY';

type VocabularyReasonCode =
  | 'RECENTLY_PUBLISHED'
  | 'IN_WORDBOOK'
  | 'PRACTICE_INCORRECT'
  | 'FIRST_INCORRECT_QUESTION_VOCABULARY'
  | 'SAVED_QUESTION_VOCABULARY';

/** 추천 read model의 문제 요약 */
export interface QuestionRecommendationProjection {
  questionId: string;
  questionVersionId: string;
  questionType: {
    id: string;
    slug: string;
    displayName: string;
  };
  skill: 'READING' | 'LISTENING';
  difficulty: number;
  reasonCode: QuestionReasonCode;
  reason: string;
}

/** 추천 read model의 어휘 요약 */
export interface VocabularyRecommendationProjection {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  reasonCode: VocabularyReasonCode;
  reason: string;
}

/** 추천 조회의 내부 projection */
export interface RecommendationProjection {
  mode: 'PERSONALIZED' | 'FALLBACK';
  meaningfulSignalCount: number;
  activationThreshold: number;
  questions: QuestionRecommendationProjection[];
  vocabularies: VocabularyRecommendationProjection[];
}

/** 결정적 추천 계산 입력 */
export interface RecommendationCalculationInput {
  meaningfulSignalCount: number;
  questions: QuestionRecommendationCandidate[];
  vocabularies: VocabularyRecommendationCandidate[];
}

interface Scored<Value, ReasonCode extends string> {
  value: Value;
  score: number;
  reasonCode: ReasonCode;
}

const ACTIVATION_THRESHOLD = 5;
const RESULT_LIMIT = 3;

const questionReason = {
  RECENTLY_PUBLISHED: '최근 게시된 문제예요.',
  SAVED_QUESTION: '저장한 문제예요.',
  FIRST_INCORRECT_RETRY: '첫 풀이에서 틀려 다시 풀어볼 문제예요.',
  PRACTICE_MISSED_VOCABULARY: '단어 연습에서 틀린 어휘가 나와요.',
  SIMILAR_QUESTION_TYPE: '틀린 문제와 같은 유형이에요.',
  SAVED_QUESTION_VOCABULARY: '저장한 문제의 핵심 어휘가 나와요.',
} satisfies Record<QuestionReasonCode, string>;

const vocabularyReason = {
  RECENTLY_PUBLISHED: '최근 게시된 어휘예요.',
  IN_WORDBOOK: '내 단어장에 담긴 어휘예요.',
  PRACTICE_INCORRECT: '단어 연습에서 틀린 어휘예요.',
  FIRST_INCORRECT_QUESTION_VOCABULARY: '첫 풀이에서 틀린 문제에 나온 어휘예요.',
  SAVED_QUESTION_VOCABULARY: '저장한 문제에 나온 어휘예요.',
} satisfies Record<VocabularyReasonCode, string>;

const publishedAtMs = (value: Date | string): number =>
  (typeof value === 'string' ? new Date(value) : value).getTime();

const comparePublishedAtThenId = (
  left: { id: string; publishedAt: Date | string },
  right: { id: string; publishedAt: Date | string },
): number =>
  publishedAtMs(right.publishedAt) - publishedAtMs(left.publishedAt) ||
  left.id.localeCompare(right.id);

const scoreQuestion = (
  candidate: QuestionRecommendationCandidate,
): Scored<
  QuestionRecommendationCandidate,
  Exclude<QuestionReasonCode, 'RECENTLY_PUBLISHED'>
> => {
  const contributions = [
    {
      active: candidate.saved,
      score: 40,
      reasonCode: 'SAVED_QUESTION' as const,
    },
    {
      active: candidate.firstIncorrect,
      score: 35,
      reasonCode: 'FIRST_INCORRECT_RETRY' as const,
    },
    {
      active: candidate.practiceIncorrectVocabulary,
      score: 25,
      reasonCode: 'PRACTICE_MISSED_VOCABULARY' as const,
    },
    {
      active: candidate.sameIncorrectType,
      score: 20,
      reasonCode: 'SIMILAR_QUESTION_TYPE' as const,
    },
    {
      active: candidate.savedQuestionVocabulary,
      score: 10,
      reasonCode: 'SAVED_QUESTION_VOCABULARY' as const,
    },
  ].filter(({ active }) => active);

  return {
    value: candidate,
    score:
      contributions.reduce(
        (total, contribution) => total + contribution.score,
        0,
      ) - (candidate.firstCorrect ? 15 : 0),
    reasonCode: contributions[0]?.reasonCode ?? 'SAVED_QUESTION_VOCABULARY',
  };
};

const scoreVocabulary = (
  candidate: VocabularyRecommendationCandidate,
): Scored<
  VocabularyRecommendationCandidate,
  Exclude<VocabularyReasonCode, 'RECENTLY_PUBLISHED'>
> => {
  const contributions = [
    {
      active: candidate.inWordbook,
      score: 40,
      reasonCode: 'IN_WORDBOOK' as const,
    },
    {
      active: candidate.practiceIncorrect,
      score: 35,
      reasonCode: 'PRACTICE_INCORRECT' as const,
    },
    {
      active: candidate.firstIncorrectQuestion,
      score: 25,
      reasonCode: 'FIRST_INCORRECT_QUESTION_VOCABULARY' as const,
    },
    {
      active: candidate.savedQuestion,
      score: 15,
      reasonCode: 'SAVED_QUESTION_VOCABULARY' as const,
    },
  ].filter(({ active }) => active);

  return {
    value: candidate,
    score: contributions.reduce(
      (total, contribution) => total + contribution.score,
      0,
    ),
    reasonCode: contributions[0]?.reasonCode ?? 'SAVED_QUESTION_VOCABULARY',
  };
};

const toQuestion = (
  candidate: QuestionRecommendationCandidate,
  reasonCode: QuestionReasonCode,
): QuestionRecommendationProjection => ({
  questionId: candidate.questionId,
  questionVersionId: candidate.questionVersionId,
  questionType: {
    id: candidate.questionTypeId,
    slug: candidate.questionTypeSlug,
    displayName: candidate.questionTypeDisplayName,
  },
  skill: candidate.skill,
  difficulty: candidate.difficulty,
  reasonCode,
  reason: questionReason[reasonCode],
});

const toVocabulary = (
  candidate: VocabularyRecommendationCandidate,
  reasonCode: VocabularyReasonCode,
): VocabularyRecommendationProjection => ({
  id: candidate.id,
  thai: candidate.thai,
  kind: candidate.kind,
  reasonCode,
  reason: vocabularyReason[reasonCode],
});

const fallback = (
  input: RecommendationCalculationInput,
): RecommendationProjection => ({
  mode: 'FALLBACK',
  meaningfulSignalCount: input.meaningfulSignalCount,
  activationThreshold: ACTIVATION_THRESHOLD,
  questions: [...input.questions]
    .sort((left, right) =>
      comparePublishedAtThenId(
        { id: left.questionId, publishedAt: left.publishedAt },
        { id: right.questionId, publishedAt: right.publishedAt },
      ),
    )
    .slice(0, RESULT_LIMIT)
    .map((candidate) => toQuestion(candidate, 'RECENTLY_PUBLISHED')),
  vocabularies: [...input.vocabularies]
    .sort(comparePublishedAtThenId)
    .slice(0, RESULT_LIMIT)
    .map((candidate) => toVocabulary(candidate, 'RECENTLY_PUBLISHED')),
});

/** 활성화 기준과 양수 점수를 적용해 최대 3개씩 추천한다 */
export const buildRecommendationResult = (
  input: RecommendationCalculationInput,
): RecommendationProjection => {
  if (input.meaningfulSignalCount < ACTIVATION_THRESHOLD) {
    return fallback(input);
  }

  const questions = input.questions.map(scoreQuestion).sort(
    (left, right) =>
      right.score - left.score ||
      comparePublishedAtThenId(
        {
          id: left.value.questionId,
          publishedAt: left.value.publishedAt,
        },
        {
          id: right.value.questionId,
          publishedAt: right.value.publishedAt,
        },
      ),
  );
  const vocabularies = input.vocabularies
    .map(scoreVocabulary)
    .sort(
      (left, right) =>
        right.score - left.score ||
        comparePublishedAtThenId(left.value, right.value),
    );
  const positiveQuestions = questions.filter(({ score }) => score > 0);
  const positiveVocabularies = vocabularies.filter(({ score }) => score > 0);

  if (positiveQuestions.length === 0 && positiveVocabularies.length === 0) {
    return fallback(input);
  }

  const recommendedQuestions = positiveQuestions
    .slice(0, RESULT_LIMIT)
    .map(({ value, reasonCode }) => toQuestion(value, reasonCode));
  const recommendedVocabularies = positiveVocabularies
    .slice(0, RESULT_LIMIT)
    .map(({ value, reasonCode }) => toVocabulary(value, reasonCode));

  return {
    mode: 'PERSONALIZED',
    meaningfulSignalCount: input.meaningfulSignalCount,
    activationThreshold: ACTIVATION_THRESHOLD,
    questions: [
      ...recommendedQuestions,
      ...questions
        .filter(({ score }) => score === 0)
        .sort((left, right) =>
          comparePublishedAtThenId(
            {
              id: left.value.questionId,
              publishedAt: left.value.publishedAt,
            },
            {
              id: right.value.questionId,
              publishedAt: right.value.publishedAt,
            },
          ),
        )
        .slice(0, RESULT_LIMIT - recommendedQuestions.length)
        .map(({ value }) => toQuestion(value, 'RECENTLY_PUBLISHED')),
    ],
    vocabularies: [
      ...recommendedVocabularies,
      ...vocabularies
        .filter(({ score }) => score === 0)
        .sort((left, right) =>
          comparePublishedAtThenId(left.value, right.value),
        )
        .slice(0, RESULT_LIMIT - recommendedVocabularies.length)
        .map(({ value }) => toVocabulary(value, 'RECENTLY_PUBLISHED')),
    ],
  };
};

const rowsOf = <Row>(result: unknown): Row[] => {
  if (Array.isArray(result)) return result as Row[];
  if (
    typeof result === 'object' &&
    result !== null &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as Row[];
  }
  return [];
};

const signalCountQuery = (userId: string): SQL => sql`
  with current_questions as (
    select q.id
    from questions q
    join question_versions qv
      on qv.id = q.current_published_version_id
     and qv.question_id = q.id
    where q.status = 'PUBLISHED'
      and qv.status = 'PUBLISHED'
      and qv.validation_status = 'PASSED'
      and qv.published_at is not null
  ),
  valid_first_attempts as (
    select qa.question_id
    from question_attempts qa
    join question_versions attempted_version
      on attempted_version.id = qa.question_version_id
     and attempted_version.question_id = qa.question_id
    where qa.user_id = ${userId}
      and qa.attempt_no = 1
      and attempted_version.status <> 'INVALIDATED'
  )
  select (
    (select count(distinct first_attempt.question_id)
      from valid_first_attempts first_attempt
      join current_questions current_question
        on current_question.id = first_attempt.question_id)
    + (select count(distinct saved.question_id)
      from saved_questions saved
      join current_questions current_question
        on current_question.id = saved.question_id
      where saved.user_id = ${userId})
    + (select count(distinct item.vocabulary_id)
      from wordbook_items item
      join wordbooks wordbook on wordbook.id = item.wordbook_id
      join vocabularies vocabulary on vocabulary.id = item.vocabulary_id
      where wordbook.user_id = ${userId}
        and vocabulary.status = 'PUBLISHED'
        and vocabulary.published_at is not null)
    + (select count(distinct practice_question.vocabulary_id)
      from vocabulary_practice_answers answer
      join vocabulary_practice_sessions session
        on session.id = answer.session_id
       and session.user_id = answer.user_id
      join vocabulary_practice_questions practice_question
        on practice_question.id = answer.question_id
       and practice_question.session_id = answer.session_id
      join vocabularies vocabulary
        on vocabulary.id = practice_question.vocabulary_id
      where answer.user_id = ${userId}
        and vocabulary.status = 'PUBLISHED'
        and vocabulary.published_at is not null)
  ) as "meaningfulSignalCount"
`;

const questionCandidateQuery = (userId: string): SQL => sql`
  with current_questions as (
    select
      q.id as question_id,
      qv.id as question_version_id,
      qv.published_at,
      qv.difficulty,
      qt.id as question_type_id,
      qt.slug as question_type_slug,
      qt.display_name as question_type_display_name,
      qt.skill
    from questions q
    join question_versions qv
      on qv.id = q.current_published_version_id
     and qv.question_id = q.id
    join question_type_versions qtv on qtv.id = qv.type_version_id
    join question_types qt on qt.id = qtv.question_type_id
    where q.status = 'PUBLISHED'
      and qv.status = 'PUBLISHED'
      and qv.validation_status = 'PASSED'
      and qv.published_at is not null
  ),
  valid_first_attempts as (
    select
      qa.question_id,
      qa.question_version_id,
      attempted_type.question_type_id,
      qa.is_correct
    from question_attempts qa
    join question_versions attempted_version
      on attempted_version.id = qa.question_version_id
     and attempted_version.question_id = qa.question_id
    join question_type_versions attempted_type
      on attempted_type.id = attempted_version.type_version_id
    where qa.user_id = ${userId}
      and qa.attempt_no = 1
      and attempted_version.status <> 'INVALIDATED'
  ),
  question_sentences as (
    select cq.question_id, block_sentence.sentence_version_id
    from current_questions cq
    join question_blocks block
      on block.question_version_id = cq.question_version_id
    join question_block_sentences block_sentence
      on block_sentence.block_id = block.id
    union
    select
      cq.question_id,
      coalesce(option.sentence_version_id, option.span_sentence_version_id)
    from current_questions cq
    join question_options option
      on option.question_version_id = cq.question_version_id
  ),
  question_vocabulary as (
    select distinct sentence.question_id, token.vocabulary_id
    from question_sentences sentence
    join token_occurrences token
      on token.sentence_version_id = sentence.sentence_version_id
     and token.role in ('TARGET', 'REQUIRED')
    join vocabularies signal_vocabulary
      on signal_vocabulary.id = token.vocabulary_id
     and signal_vocabulary.status = 'PUBLISHED'
     and signal_vocabulary.published_at is not null
    union
    select distinct sentence.question_id, expression.vocabulary_id
    from question_sentences sentence
    join expression_occurrences expression
      on expression.sentence_version_id = sentence.sentence_version_id
    join vocabularies signal_vocabulary
      on signal_vocabulary.id = expression.vocabulary_id
     and signal_vocabulary.status = 'PUBLISHED'
     and signal_vocabulary.published_at is not null
    where exists (
      select 1
      from token_occurrences overlapping_token
      where overlapping_token.sentence_version_id =
          expression.sentence_version_id
        and overlapping_token.position >= expression.start_token_index
        and overlapping_token.position < expression.end_token_index
        and overlapping_token.role in ('TARGET', 'REQUIRED')
    )
  ),
  practice_incorrect_vocabulary as (
    select distinct practice_question.vocabulary_id
    from vocabulary_practice_answers answer
    join vocabulary_practice_sessions session
      on session.id = answer.session_id
     and session.user_id = answer.user_id
    join vocabulary_practice_questions practice_question
      on practice_question.id = answer.question_id
     and practice_question.session_id = answer.session_id
    join vocabularies vocabulary
      on vocabulary.id = practice_question.vocabulary_id
    where answer.user_id = ${userId}
      and answer.is_correct = false
      and vocabulary.status = 'PUBLISHED'
      and vocabulary.published_at is not null
  ),
  saved_question_vocabulary as (
    select distinct question_vocabulary.vocabulary_id
    from saved_questions saved
    join current_questions current_question
      on current_question.question_id = saved.question_id
    join question_vocabulary
      on question_vocabulary.question_id = saved.question_id
    where saved.user_id = ${userId}
  ),
  incorrect_question_types as (
    select distinct first_attempt.question_type_id
    from valid_first_attempts first_attempt
    join current_questions current_question
      on current_question.question_id = first_attempt.question_id
    where first_attempt.is_correct = false
  )
  select
    candidate.question_id as "questionId",
    candidate.question_version_id as "questionVersionId",
    candidate.question_type_id as "questionTypeId",
    candidate.question_type_slug as "questionTypeSlug",
    candidate.question_type_display_name as "questionTypeDisplayName",
    candidate.skill,
    candidate.difficulty,
    candidate.published_at as "publishedAt",
    exists (
      select 1 from saved_questions saved
      where saved.user_id = ${userId}
        and saved.question_id = candidate.question_id
    ) as saved,
    exists (
      select 1 from valid_first_attempts first_attempt
      where first_attempt.question_id = candidate.question_id
        and first_attempt.is_correct = false
    ) as "firstIncorrect",
    exists (
      select 1
      from question_vocabulary candidate_vocabulary
      join practice_incorrect_vocabulary practice_vocabulary
        on practice_vocabulary.vocabulary_id =
          candidate_vocabulary.vocabulary_id
      where candidate_vocabulary.question_id = candidate.question_id
    ) as "practiceIncorrectVocabulary",
    exists (
      select 1 from incorrect_question_types incorrect_type
      where incorrect_type.question_type_id = candidate.question_type_id
    ) as "sameIncorrectType",
    exists (
      select 1
      from question_vocabulary candidate_vocabulary
      join saved_question_vocabulary saved_vocabulary
        on saved_vocabulary.vocabulary_id = candidate_vocabulary.vocabulary_id
      where candidate_vocabulary.question_id = candidate.question_id
    ) as "savedQuestionVocabulary",
    exists (
      select 1 from valid_first_attempts first_attempt
      where first_attempt.question_id = candidate.question_id
        and first_attempt.is_correct = true
    ) as "firstCorrect"
  from current_questions candidate
`;

const vocabularyCandidateQuery = (userId: string): SQL => sql`
  with current_questions as (
    select
      q.id as question_id,
      qv.id as question_version_id
    from questions q
    join question_versions qv
      on qv.id = q.current_published_version_id
     and qv.question_id = q.id
    where q.status = 'PUBLISHED'
      and qv.status = 'PUBLISHED'
      and qv.validation_status = 'PASSED'
      and qv.published_at is not null
  ),
  valid_first_attempts as (
    select
      qa.question_id,
      qa.question_version_id,
      attempted_type.question_type_id,
      qa.is_correct
    from question_attempts qa
    join question_versions attempted_version
      on attempted_version.id = qa.question_version_id
     and attempted_version.question_id = qa.question_id
    join question_type_versions attempted_type
      on attempted_type.id = attempted_version.type_version_id
    where qa.user_id = ${userId}
      and qa.attempt_no = 1
      and attempted_version.status <> 'INVALIDATED'
  ),
  question_sentences as (
    select cq.question_id, block_sentence.sentence_version_id
    from current_questions cq
    join question_blocks block
      on block.question_version_id = cq.question_version_id
    join question_block_sentences block_sentence
      on block_sentence.block_id = block.id
    union
    select
      cq.question_id,
      coalesce(option.sentence_version_id, option.span_sentence_version_id)
    from current_questions cq
    join question_options option
      on option.question_version_id = cq.question_version_id
  ),
  question_vocabulary as (
    select distinct sentence.question_id, token.vocabulary_id
    from question_sentences sentence
    join token_occurrences token
      on token.sentence_version_id = sentence.sentence_version_id
     and token.role in ('TARGET', 'REQUIRED')
    join vocabularies signal_vocabulary
      on signal_vocabulary.id = token.vocabulary_id
     and signal_vocabulary.status = 'PUBLISHED'
     and signal_vocabulary.published_at is not null
    union
    select distinct sentence.question_id, expression.vocabulary_id
    from question_sentences sentence
    join expression_occurrences expression
      on expression.sentence_version_id = sentence.sentence_version_id
    join vocabularies signal_vocabulary
      on signal_vocabulary.id = expression.vocabulary_id
     and signal_vocabulary.status = 'PUBLISHED'
     and signal_vocabulary.published_at is not null
    where exists (
      select 1
      from token_occurrences overlapping_token
      where overlapping_token.sentence_version_id =
          expression.sentence_version_id
        and overlapping_token.position >= expression.start_token_index
        and overlapping_token.position < expression.end_token_index
      and overlapping_token.role in ('TARGET', 'REQUIRED')
    )
  ),
  attempted_question_sentences as (
    select
      first_attempt.question_id,
      block_sentence.sentence_version_id
    from valid_first_attempts first_attempt
    join question_blocks block
      on block.question_version_id = first_attempt.question_version_id
    join question_block_sentences block_sentence
      on block_sentence.block_id = block.id
    union
    select
      first_attempt.question_id,
      coalesce(option.sentence_version_id, option.span_sentence_version_id)
    from valid_first_attempts first_attempt
    join question_options option
      on option.question_version_id = first_attempt.question_version_id
  ),
  attempted_question_vocabulary as (
    select distinct sentence.question_id, token.vocabulary_id
    from attempted_question_sentences sentence
    join token_occurrences token
      on token.sentence_version_id = sentence.sentence_version_id
     and token.role in ('TARGET', 'REQUIRED')
    join vocabularies signal_vocabulary
      on signal_vocabulary.id = token.vocabulary_id
     and signal_vocabulary.status = 'PUBLISHED'
     and signal_vocabulary.published_at is not null
    union
    select distinct sentence.question_id, expression.vocabulary_id
    from attempted_question_sentences sentence
    join expression_occurrences expression
      on expression.sentence_version_id = sentence.sentence_version_id
    join vocabularies signal_vocabulary
      on signal_vocabulary.id = expression.vocabulary_id
     and signal_vocabulary.status = 'PUBLISHED'
     and signal_vocabulary.published_at is not null
    where exists (
      select 1
      from token_occurrences overlapping_token
      where overlapping_token.sentence_version_id =
          expression.sentence_version_id
        and overlapping_token.position >= expression.start_token_index
        and overlapping_token.position < expression.end_token_index
        and overlapping_token.role in ('TARGET', 'REQUIRED')
    )
  ),
  practice_incorrect_vocabulary as (
    select distinct practice_question.vocabulary_id
    from vocabulary_practice_answers answer
    join vocabulary_practice_sessions session
      on session.id = answer.session_id
     and session.user_id = answer.user_id
    join vocabulary_practice_questions practice_question
      on practice_question.id = answer.question_id
     and practice_question.session_id = answer.session_id
    where answer.user_id = ${userId}
      and answer.is_correct = false
  ),
  first_incorrect_question_vocabulary as (
    select distinct attempted_vocabulary.vocabulary_id
    from valid_first_attempts first_attempt
    join current_questions current_question
      on current_question.question_id = first_attempt.question_id
    join attempted_question_vocabulary attempted_vocabulary
      on attempted_vocabulary.question_id = first_attempt.question_id
    where first_attempt.is_correct = false
  ),
  saved_question_vocabulary as (
    select distinct question_vocabulary.vocabulary_id
    from saved_questions saved
    join current_questions current_question
      on current_question.question_id = saved.question_id
    join question_vocabulary
      on question_vocabulary.question_id = saved.question_id
    where saved.user_id = ${userId}
  )
  select
    vocabulary.id,
    vocabulary.thai,
    vocabulary.kind,
    vocabulary.published_at as "publishedAt",
    exists (
      select 1
      from wordbook_items item
      join wordbooks wordbook on wordbook.id = item.wordbook_id
      where item.vocabulary_id = vocabulary.id
        and wordbook.user_id = ${userId}
    ) as "inWordbook",
    exists (
      select 1
      from practice_incorrect_vocabulary practice_vocabulary
      where practice_vocabulary.vocabulary_id = vocabulary.id
    ) as "practiceIncorrect",
    exists (
      select 1
      from first_incorrect_question_vocabulary incorrect_vocabulary
      where incorrect_vocabulary.vocabulary_id = vocabulary.id
    ) as "firstIncorrectQuestion",
    exists (
      select 1
      from saved_question_vocabulary saved_vocabulary
      where saved_vocabulary.vocabulary_id = vocabulary.id
    ) as "savedQuestion"
  from vocabularies vocabulary
  where vocabulary.status = 'PUBLISHED'
    and vocabulary.published_at is not null
`;

/** 추천 전용 SQL과 결정적 점수 계산을 조립하는 read-only query */
export class DrizzleRecommendationQuery {
  constructor(private readonly database: RecommendationReadDatabase) {}

  /** 현재 공개 콘텐츠와 유효 원시 기록만 사용해 홈 추천을 계산한다 */
  async getForUser(userId: string): Promise<RecommendationProjection> {
    // Pool과 단일 transaction client가 같은 query adapter를 안전하게 공유한다.
    const signalResult = await this.database.execute(signalCountQuery(userId));
    const questionResult = await this.database.execute(
      questionCandidateQuery(userId),
    );
    const vocabularyResult = await this.database.execute(
      vocabularyCandidateQuery(userId),
    );
    const [signal] = rowsOf<{ meaningfulSignalCount: number | string }>(
      signalResult,
    );

    return buildRecommendationResult({
      meaningfulSignalCount: Number(signal?.meaningfulSignalCount ?? 0),
      questions: rowsOf<QuestionRecommendationCandidate>(questionResult),
      vocabularies: rowsOf<VocabularyRecommendationCandidate>(vocabularyResult),
    });
  }
}

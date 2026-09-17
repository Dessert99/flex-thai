/** 원시 학습 기록에서 현재 공개 문제·어휘 추천을 요청 시 계산한다 */
import { sql, type SQL } from 'drizzle-orm';

interface RecommendationReadDatabase {
  execute(query: SQL): Promise<unknown>;
}

/** 추천 계산에 필요한 현재 게시 문제와 기여 신호 */
export interface QuestionRecommendationCandidate {
  questionId: string;
  questionVersion: number;
  questionTypeId: string;
  questionTypeSlug: string;
  questionTypeDisplayName: string;
  skill: 'READING';
  difficulty: number;
  publishedAt: Date | string;
  publishedToday: boolean;
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
  publishedToday: boolean;
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
  questionVersion: number;
  questionType: {
    id: string;
    slug: string;
    displayName: string;
  };
  skill: 'READING';
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
  publishedToday: HomeContentProjection;
  newContent: HomeContentProjection;
  questions: QuestionRecommendationProjection[];
  vocabularies: VocabularyRecommendationProjection[];
}

/** 학습자 홈의 문제·어휘 게시 묶음 */
export interface HomeContentProjection {
  questions: Array<{
    questionId: string;
    questionVersion: number;
    questionTypeDisplayName: string;
    skill: 'READING';
    difficulty: number;
    publishedAt: string;
  }>;
  vocabularies: Array<{
    id: string;
    thai: string;
    kind: 'WORD' | 'EXPRESSION';
    publishedAt: string;
  }>;
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
  questionVersion: candidate.questionVersion,
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
  ...buildHomeContent(input),
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

const toIsoString = (value: Date | string): string =>
  (typeof value === 'string' ? new Date(value) : value).toISOString();

const buildHomeContentGroup = (
  input: RecommendationCalculationInput,
  publishedToday: boolean,
): HomeContentProjection => ({
  questions: input.questions
    .filter((candidate) => candidate.publishedToday === publishedToday)
    .sort((left, right) =>
      comparePublishedAtThenId(
        { id: left.questionId, publishedAt: left.publishedAt },
        { id: right.questionId, publishedAt: right.publishedAt },
      ),
    )
    .slice(0, RESULT_LIMIT)
    .map((candidate) => ({
      questionId: candidate.questionId,
      questionVersion: candidate.questionVersion,
      questionTypeDisplayName: candidate.questionTypeDisplayName,
      skill: candidate.skill,
      difficulty: candidate.difficulty,
      publishedAt: toIsoString(candidate.publishedAt),
    })),
  vocabularies: input.vocabularies
    .filter((candidate) => candidate.publishedToday === publishedToday)
    .sort(comparePublishedAtThenId)
    .slice(0, RESULT_LIMIT)
    .map((candidate) => ({
      id: candidate.id,
      thai: candidate.thai,
      kind: candidate.kind,
      publishedAt: toIsoString(candidate.publishedAt),
    })),
});

const buildHomeContent = (
  input: RecommendationCalculationInput,
): Pick<RecommendationProjection, 'publishedToday' | 'newContent'> => ({
  publishedToday: buildHomeContentGroup(input, true),
  newContent: buildHomeContentGroup(input, false),
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
    ...buildHomeContent(input),
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
    where q.status = 'PUBLISHED'
      and q.published_at is not null
  ),
  valid_first_attempts as (
    select qa.question_id, qa.question_version, attempted_type.question_type_id, qa.is_correct
    from question_attempts qa
    join questions current_q on current_q.id = qa.question_id and current_q.version = qa.question_version and current_q.status = 'PUBLISHED'
    join question_type_versions attempted_type on attempted_type.id = current_q.type_version_id
    where qa.user_id = ${userId}
      and qa.attempt_no = (select max(a.attempt_no) from question_attempts a where a.user_id = qa.user_id and a.question_id = qa.question_id)
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
      q.version as question_version,
      q.published_at,
      q.published_at::date = current_date as published_today,
      q.difficulty,
      qt.id as question_type_id,
      qt.slug as question_type_slug,
      qt.display_name as question_type_display_name,
      qt.skill
    from questions q
    join question_type_versions qtv on qtv.id = q.type_version_id
    join question_types qt on qt.id = qtv.question_type_id
    where q.status = 'PUBLISHED'
      and q.published_at is not null
  ),
  valid_first_attempts as (
    select qa.question_id, qa.question_version, attempted_type.question_type_id, qa.is_correct
    from question_attempts qa
    join questions current_q on current_q.id = qa.question_id and current_q.version = qa.question_version and current_q.status = 'PUBLISHED'
    join question_type_versions attempted_type on attempted_type.id = current_q.type_version_id
    where qa.user_id = ${userId}
      and qa.attempt_no = (select max(a.attempt_no) from question_attempts a where a.user_id = qa.user_id and a.question_id = qa.question_id)
  ),
  question_vocabulary as (
    select usage.question_id, usage.vocabulary_id
    from question_vocabularies usage
    join current_questions cq on cq.question_id = usage.question_id
    join vocabularies v on v.id = usage.vocabulary_id and v.status = 'PUBLISHED'
    where usage.role = 'TARGET'
  ),
  attempted_question_vocabulary as (
    select usage.question_id, usage.vocabulary_id from question_vocabulary usage
    join valid_first_attempts attempt on attempt.question_id = usage.question_id
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
    candidate.question_version as "questionVersion",
    candidate.question_type_id as "questionTypeId",
    candidate.question_type_slug as "questionTypeSlug",
    candidate.question_type_display_name as "questionTypeDisplayName",
    candidate.skill,
    candidate.difficulty,
    candidate.published_at as "publishedAt",
    candidate.published_today as "publishedToday",
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
      q.version as question_version
    from questions q
    where q.status = 'PUBLISHED'
      and q.published_at is not null
  ),
  valid_first_attempts as (
    select qa.question_id, qa.question_version, attempted_type.question_type_id, qa.is_correct
    from question_attempts qa
    join questions current_q on current_q.id = qa.question_id and current_q.version = qa.question_version and current_q.status = 'PUBLISHED'
    join question_type_versions attempted_type on attempted_type.id = current_q.type_version_id
    where qa.user_id = ${userId}
      and qa.attempt_no = (select max(a.attempt_no) from question_attempts a where a.user_id = qa.user_id and a.question_id = qa.question_id)
  ),
  question_vocabulary as (
    select usage.question_id, usage.vocabulary_id
    from question_vocabularies usage
    join current_questions cq on cq.question_id = usage.question_id
    join vocabularies v on v.id = usage.vocabulary_id and v.status = 'PUBLISHED'
    where usage.role = 'TARGET'
  ),
  attempted_question_vocabulary as (
    select usage.question_id, usage.vocabulary_id from question_vocabulary usage
    join valid_first_attempts attempt on attempt.question_id = usage.question_id
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
    vocabulary.published_at::date = current_date as "publishedToday",
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

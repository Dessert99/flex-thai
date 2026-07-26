/** 현재 게시 문제와 append-only 풀이 기록을 정답 노출 없이 읽는다 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias, type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  expressionOccurrences,
  mediaAssets,
  questionAttempts,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionTypes,
  questionTypeVersions,
  questionVersions,
  savedQuestions,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type LearnerQuestionDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 문제 목록의 시험 영역 */
export type LearnerQuestionSkill = 'READING' | 'LISTENING';

/** 첫 답의 유효 결과 */
export type LearnerQuestionFirstResult = 'CORRECT' | 'INCORRECT' | 'UNANSWERED';

/** database query가 소비하는 검증 완료 문제 목록 조건 */
export interface LearnerQuestionListQuery {
  skill?: LearnerQuestionSkill;
  questionTypeId?: string;
  difficulty?: number;
  saved?: boolean;
  firstResult?: LearnerQuestionFirstResult;
  page: number;
  pageSize: number;
}

/** database query가 소비하는 검증 완료 공통 page 조건 */
export interface LearnerQuestionPageQuery {
  page: number;
  pageSize: number;
}

/** API mapper가 재사용하는 내부 page metadata */
export interface LearnerQuestionPageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** 정답 없이 문제 유형을 식별하는 내부 projection */
export interface LearnerQuestionTypeProjection {
  id: string;
  slug: string;
  displayName: string;
}

/** 현재 게시 문제 목록 한 건의 내부 projection */
export interface LearnerQuestionListItemProjection {
  questionId: string;
  questionVersionId: string;
  questionType: LearnerQuestionTypeProjection;
  skill: LearnerQuestionSkill;
  difficulty: number;
  saved: boolean;
  firstResult: LearnerQuestionFirstResult;
}

/** 현재 게시 문제 목록의 내부 page projection */
export interface LearnerQuestionListProjection {
  items: LearnerQuestionListItemProjection[];
  page: LearnerQuestionPageMetadata;
}

/** private media key를 API mapper에만 전달하는 내부 projection */
export interface LearnerQuestionMediaProjection {
  storageKey: string;
}

/** 문장 안 공용 어휘 출현의 내부 projection */
export interface LearnerQuestionTokenProjection {
  position: number;
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  media: LearnerQuestionMediaProjection | null;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING' | 'INSTRUCTION';
}

/** 문장 안 다단어 표현 범위의 내부 projection */
export interface LearnerQuestionExpressionProjection {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  media: LearnerQuestionMediaProjection | null;
  representative: boolean;
}

/** 블록과 선택지가 같은 객체로 공유하는 불변 문장 projection */
export interface LearnerQuestionSentenceProjection {
  sentenceVersionId: string;
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  media: LearnerQuestionMediaProjection;
  tokens: LearnerQuestionTokenProjection[];
  expressions: LearnerQuestionExpressionProjection[];
}

/** 블록 안 문장 연결의 위치와 화자를 보존하는 projection */
export interface LearnerQuestionBlockSentenceProjection {
  position: number;
  speaker: string | null;
  sentence: LearnerQuestionSentenceProjection;
}

/** 제출 전 공개 블록과 제출 후 해설 블록이 공유하는 내부 projection */
export interface LearnerQuestionBlockProjection {
  id: string;
  kind: 'INSTRUCTION' | 'PASSAGE' | 'DIALOGUE' | 'QUESTION' | 'EXPLANATION';
  displayMode: 'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO' | 'AUDIO_THEN_REVEAL';
  position: number;
  sentences: LearnerQuestionBlockSentenceProjection[];
}

interface LearnerQuestionOptionProjectionBase {
  id: string;
  position: number;
}

/** 정답 flag를 제외한 일반 문장 또는 inline 범위 선택지 projection */
export type LearnerQuestionOptionProjection =
  | (LearnerQuestionOptionProjectionBase & {
      sentence: LearnerQuestionSentenceProjection;
      span: null;
    })
  | (LearnerQuestionOptionProjectionBase & {
      sentence: null;
      span: {
        sentenceVersionId: string;
        startTokenIndex: number;
        endTokenIndex: number;
      };
    });

/** 현재 게시 버전의 제출 전 문제 상세 projection */
export interface LearnerQuestionDetailProjection {
  questionId: string;
  questionVersionId: string;
  questionType: LearnerQuestionTypeProjection;
  skill: LearnerQuestionSkill;
  difficulty: number;
  template:
    | 'STANDARD_CHOICE'
    | 'PASSAGE_CHOICE'
    | 'DIALOGUE_CHOICE'
    | 'INLINE_SPAN_CHOICE';
  blocks: LearnerQuestionBlockProjection[];
  options: LearnerQuestionOptionProjection[];
  saved: boolean;
}

/** 현재 콘텐츠 상태와 무관하게 보존하는 원시 답안 projection */
export interface LearnerQuestionAttemptProjection {
  id: string;
  questionId: string;
  questionVersionId: string;
  attemptNo: number;
  selectedOptionId: string;
  clientAttemptId: string;
  durationMs: number;
  isCorrect: boolean;
  submittedAt: Date;
}

/** 원시 풀이 기록의 내부 page projection */
export interface LearnerQuestionAttemptListProjection {
  items: LearnerQuestionAttemptProjection[];
  page: LearnerQuestionPageMetadata;
}

const toPageMetadata = (
  query: LearnerQuestionPageQuery,
  totalItems: number,
): LearnerQuestionPageMetadata => ({
  page: query.page,
  pageSize: query.pageSize,
  totalItems,
  totalPages: Math.ceil(totalItems / query.pageSize),
});

const comparePosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

const compareExpressionPosition = (
  left: {
    occurrenceId: string;
    startTokenIndex: number;
    endTokenIndex: number;
  },
  right: {
    occurrenceId: string;
    startTokenIndex: number;
    endTokenIndex: number;
  },
): number =>
  left.startTokenIndex - right.startTokenIndex ||
  left.endTokenIndex - right.endTokenIndex ||
  (left.occurrenceId < right.occurrenceId
    ? -1
    : left.occurrenceId > right.occurrenceId
      ? 1
      : 0);

const requireSentence = (
  sentences: Map<string, LearnerQuestionSentenceProjection>,
  sentenceVersionId: string,
): LearnerQuestionSentenceProjection => {
  const sentence = sentences.get(sentenceVersionId);
  if (!sentence) {
    throw new Error(`LEARNER_QUESTION_SENTENCE_MISSING:${sentenceVersionId}`);
  }
  return sentence;
};

/** SQL projection을 API mapper용 계층 구조로 조립하는 read-only query */
export class DrizzleLearnerQuestionQuery {
  constructor(private readonly database: LearnerQuestionDatabase) {}

  /** 현재 게시 문제만 first-result와 저장 상태까지 계산해 page로 반환한다 */
  async listQuestions(
    userId: string,
    query: LearnerQuestionListQuery,
  ): Promise<LearnerQuestionListProjection> {
    const firstAttempts = alias(questionAttempts, 'first_question_attempts');
    const firstAttemptVersions = alias(
      questionVersions,
      'first_attempt_question_versions',
    );
    const firstResult = sql<LearnerQuestionFirstResult>`case
      when ${firstAttempts.id} is null
        or ${firstAttemptVersions.status} = ${'INVALIDATED'}
        then 'UNANSWERED'
      when ${firstAttempts.isCorrect} then 'CORRECT'
      else 'INCORRECT'
    end`;
    const saved = sql<boolean>`${savedQuestions.questionId} is not null`;
    const conditions: SQL[] = [
      eq(questions.status, 'PUBLISHED'),
      eq(questionVersions.status, 'PUBLISHED'),
    ];
    if (query.skill !== undefined) {
      conditions.push(eq(questionTypes.skill, query.skill));
    }
    if (query.questionTypeId !== undefined) {
      conditions.push(eq(questionTypes.id, query.questionTypeId));
    }
    if (query.difficulty !== undefined) {
      conditions.push(eq(questionVersions.difficulty, query.difficulty));
    }
    if (query.saved !== undefined) {
      conditions.push(
        query.saved
          ? isNotNull(savedQuestions.questionId)
          : isNull(savedQuestions.questionId),
      );
    }
    if (query.firstResult !== undefined) {
      conditions.push(sql`${firstResult} = ${query.firstResult}`);
    }

    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, questions.id),
          eq(questionVersions.id, questions.currentPublishedVersionId),
        ),
      )
      .innerJoin(
        questionTypeVersions,
        eq(questionVersions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .leftJoin(
        savedQuestions,
        and(
          eq(savedQuestions.questionId, questions.id),
          eq(savedQuestions.userId, userId),
        ),
      )
      .leftJoin(
        firstAttempts,
        and(
          eq(firstAttempts.userId, userId),
          eq(firstAttempts.questionId, questions.id),
          eq(firstAttempts.attemptNo, 1),
        ),
      )
      .leftJoin(
        firstAttemptVersions,
        and(
          eq(firstAttemptVersions.questionId, firstAttempts.questionId),
          eq(firstAttemptVersions.id, firstAttempts.questionVersionId),
        ),
      )
      .where(and(...conditions));
    const totalItems = totalRow?.totalItems ?? 0;
    const rows = await this.database
      .select({
        questionId: questions.id,
        questionVersionId: questionVersions.id,
        questionTypeId: questionTypes.id,
        questionTypeSlug: questionTypes.slug,
        questionTypeDisplayName: questionTypes.displayName,
        skill: questionTypes.skill,
        difficulty: questionVersions.difficulty,
        saved,
        firstResult,
      })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, questions.id),
          eq(questionVersions.id, questions.currentPublishedVersionId),
        ),
      )
      .innerJoin(
        questionTypeVersions,
        eq(questionVersions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .leftJoin(
        savedQuestions,
        and(
          eq(savedQuestions.questionId, questions.id),
          eq(savedQuestions.userId, userId),
        ),
      )
      .leftJoin(
        firstAttempts,
        and(
          eq(firstAttempts.userId, userId),
          eq(firstAttempts.questionId, questions.id),
          eq(firstAttempts.attemptNo, 1),
        ),
      )
      .leftJoin(
        firstAttemptVersions,
        and(
          eq(firstAttemptVersions.questionId, firstAttempts.questionId),
          eq(firstAttemptVersions.id, firstAttempts.questionVersionId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(questions.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      items: rows.map((row) => ({
        questionId: row.questionId,
        questionVersionId: row.questionVersionId,
        questionType: {
          id: row.questionTypeId,
          slug: row.questionTypeSlug,
          displayName: row.questionTypeDisplayName,
        },
        skill: row.skill,
        difficulty: row.difficulty,
        saved: row.saved,
        firstResult: row.firstResult,
      })),
      page: toPageMetadata(query, totalItems),
    };
  }

  /** 현재 공개 버전의 블록·선택지를 정답과 해설 없이 조립한다 */
  async getQuestionDetail(
    userId: string,
    questionId: string,
  ): Promise<LearnerQuestionDetailProjection | null> {
    const [base] = await this.database
      .select({
        questionId: questions.id,
        questionVersionId: questionVersions.id,
        questionTypeId: questionTypes.id,
        questionTypeSlug: questionTypes.slug,
        questionTypeDisplayName: questionTypes.displayName,
        skill: questionTypes.skill,
        difficulty: questionVersions.difficulty,
        template: questionTypeVersions.template,
        saved: sql<boolean>`${savedQuestions.questionId} is not null`,
      })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, questions.id),
          eq(questionVersions.id, questions.currentPublishedVersionId),
        ),
      )
      .innerJoin(
        questionTypeVersions,
        eq(questionVersions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .leftJoin(
        savedQuestions,
        and(
          eq(savedQuestions.questionId, questions.id),
          eq(savedQuestions.userId, userId),
        ),
      )
      .where(
        and(
          eq(questions.id, questionId),
          eq(questions.status, 'PUBLISHED'),
          eq(questionVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    if (!base) {
      return null;
    }

    const blockRows = await this.loadBlockRows(
      base.questionVersionId,
      'PUBLIC',
    );
    const blockSentenceRows = await this.loadBlockSentenceRows(blockRows);
    const optionRows = await this.database
      .select({
        id: questionOptions.id,
        sentenceVersionId: questionOptions.sentenceVersionId,
        spanSentenceVersionId: questionOptions.spanSentenceVersionId,
        spanStartTokenIndex: questionOptions.spanStartTokenIndex,
        spanEndTokenIndex: questionOptions.spanEndTokenIndex,
        position: questionOptions.position,
      })
      .from(questionOptions)
      .where(eq(questionOptions.questionVersionId, base.questionVersionId))
      .orderBy(asc(questionOptions.position));
    const sentenceIds = [
      ...new Set([
        ...blockSentenceRows.map((row) => row.sentenceVersionId),
        ...optionRows
          .map((row) => row.sentenceVersionId)
          .filter((id): id is string => id !== null),
      ]),
    ];
    const sentences = await this.loadSentences(sentenceIds);

    return {
      questionId: base.questionId,
      questionVersionId: base.questionVersionId,
      questionType: {
        id: base.questionTypeId,
        slug: base.questionTypeSlug,
        displayName: base.questionTypeDisplayName,
      },
      skill: base.skill,
      difficulty: base.difficulty,
      template: base.template,
      blocks: this.assembleBlocks(blockRows, blockSentenceRows, sentences),
      options: optionRows
        .sort(comparePosition)
        .map((option): LearnerQuestionOptionProjection => {
          if (option.sentenceVersionId !== null) {
            return {
              id: option.id,
              position: option.position,
              sentence: requireSentence(sentences, option.sentenceVersionId),
              span: null,
            };
          }
          if (
            option.spanSentenceVersionId === null ||
            option.spanSentenceVersionId === undefined ||
            option.spanStartTokenIndex === null ||
            option.spanStartTokenIndex === undefined ||
            option.spanEndTokenIndex === null ||
            option.spanEndTokenIndex === undefined
          ) {
            throw new Error('inline option span projection is incomplete');
          }
          return {
            id: option.id,
            position: option.position,
            sentence: null,
            span: {
              sentenceVersionId: option.spanSentenceVersionId,
              startTokenIndex: option.spanStartTokenIndex,
              endTokenIndex: option.spanEndTokenIndex,
            },
          };
        }),
      saved: base.saved,
    };
  }

  /** 제출 뒤 historical immutable version의 해설만 수명 상태 제한 없이 복원한다 */
  async getExplanation(
    questionVersionId: string,
  ): Promise<LearnerQuestionBlockProjection[]> {
    const blockRows = await this.loadBlockRows(
      questionVersionId,
      'EXPLANATION',
    );
    const blockSentenceRows = await this.loadBlockSentenceRows(blockRows);
    const sentences = await this.loadSentences([
      ...new Set(blockSentenceRows.map((row) => row.sentenceVersionId)),
    ]);
    return this.assembleBlocks(blockRows, blockSentenceRows, sentences);
  }

  /** append-only 답안을 콘텐츠 수명 상태와 무관하게 원시 page로 반환한다 */
  async listAttempts(
    userId: string,
    query: LearnerQuestionPageQuery,
  ): Promise<LearnerQuestionAttemptListProjection> {
    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(questionAttempts)
      .where(eq(questionAttempts.userId, userId));
    const totalItems = totalRow?.totalItems ?? 0;
    const items = await this.database
      .select({
        id: questionAttempts.id,
        questionId: questionAttempts.questionId,
        questionVersionId: questionAttempts.questionVersionId,
        attemptNo: questionAttempts.attemptNo,
        selectedOptionId: questionAttempts.selectedOptionId,
        clientAttemptId: questionAttempts.clientAttemptId,
        durationMs: questionAttempts.durationMs,
        isCorrect: questionAttempts.isCorrect,
        submittedAt: questionAttempts.submittedAt,
      })
      .from(questionAttempts)
      .where(eq(questionAttempts.userId, userId))
      .orderBy(desc(questionAttempts.submittedAt), desc(questionAttempts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return { items, page: toPageMetadata(query, totalItems) };
  }

  private async loadBlockRows(
    questionVersionId: string,
    scope: 'PUBLIC' | 'EXPLANATION',
  ) {
    return this.database
      .select({
        id: questionBlocks.id,
        kind: questionBlocks.kind,
        displayMode: questionBlocks.displayMode,
        position: questionBlocks.position,
      })
      .from(questionBlocks)
      .where(
        and(
          eq(questionBlocks.questionVersionId, questionVersionId),
          scope === 'PUBLIC'
            ? ne(questionBlocks.kind, 'EXPLANATION')
            : eq(questionBlocks.kind, 'EXPLANATION'),
        ),
      )
      .orderBy(asc(questionBlocks.position));
  }

  private async loadBlockSentenceRows(
    blocks: Array<{ id: string; position: number }>,
  ) {
    if (blocks.length === 0) {
      return [];
    }
    return this.database
      .select({
        blockId: questionBlockSentences.blockId,
        sentenceVersionId: questionBlockSentences.sentenceVersionId,
        position: questionBlockSentences.position,
        speaker: questionBlockSentences.speaker,
      })
      .from(questionBlockSentences)
      .where(
        inArray(
          questionBlockSentences.blockId,
          blocks.map((block) => block.id),
        ),
      )
      .orderBy(
        asc(questionBlockSentences.blockId),
        asc(questionBlockSentences.position),
      );
  }

  private async loadSentences(
    sentenceVersionIds: string[],
  ): Promise<Map<string, LearnerQuestionSentenceProjection>> {
    if (sentenceVersionIds.length === 0) {
      return new Map();
    }
    const tokenPronunciations = alias(
      vocabularyPronunciations,
      'learner_question_token_pronunciations',
    );
    const tokenMediaAssets = alias(
      mediaAssets,
      'learner_question_token_media_assets',
    );
    const expressionPronunciations = alias(
      vocabularyPronunciations,
      'learner_question_expression_pronunciations',
    );
    const expressionMediaAssets = alias(
      mediaAssets,
      'learner_question_expression_media_assets',
    );
    const sentenceRows = await this.database
      .select({
        sentenceVersionId: thaiSentenceVersions.id,
        originalText: thaiSentenceVersions.originalText,
        translationKo: thaiSentenceVersions.translationKo,
        pronunciationKo: thaiSentenceVersions.pronunciationKo,
        toneMarks: thaiSentenceVersions.toneMarks,
        mediaStorageKey: mediaAssets.storageKey,
      })
      .from(thaiSentenceVersions)
      .innerJoin(
        mediaAssets,
        eq(thaiSentenceVersions.mediaAssetId, mediaAssets.id),
      )
      .where(
        and(
          inArray(thaiSentenceVersions.id, sentenceVersionIds),
          eq(mediaAssets.status, 'READY'),
        ),
      )
      .orderBy(asc(thaiSentenceVersions.id));
    const tokenRows = await this.database
      .select({
        sentenceVersionId: tokenOccurrences.sentenceVersionId,
        position: tokenOccurrences.position,
        surface: tokenOccurrences.surface,
        startOffset: tokenOccurrences.startOffset,
        endOffset: tokenOccurrences.endOffset,
        vocabularyId: tokenOccurrences.vocabularyId,
        meaningId: tokenOccurrences.meaningId,
        pronunciationId: tokenOccurrences.pronunciationId,
        contextMeaningKo: tokenOccurrences.contextMeaningKo,
        pronunciationKo: tokenPronunciations.pronunciationKo,
        toneMarks: tokenPronunciations.toneMarks,
        mediaStorageKey: tokenMediaAssets.storageKey,
        role: tokenOccurrences.role,
      })
      .from(tokenOccurrences)
      .innerJoin(
        tokenPronunciations,
        and(
          eq(tokenOccurrences.pronunciationId, tokenPronunciations.id),
          eq(tokenOccurrences.vocabularyId, tokenPronunciations.vocabularyId),
        ),
      )
      .leftJoin(
        tokenMediaAssets,
        eq(tokenPronunciations.mediaAssetId, tokenMediaAssets.id),
      )
      .where(inArray(tokenOccurrences.sentenceVersionId, sentenceVersionIds))
      .orderBy(
        asc(tokenOccurrences.sentenceVersionId),
        asc(tokenOccurrences.position),
      );
    const expressionRows = await this.database
      .select({
        occurrenceId: expressionOccurrences.id,
        sentenceVersionId: expressionOccurrences.sentenceVersionId,
        startTokenIndex: expressionOccurrences.startTokenIndex,
        endTokenIndex: expressionOccurrences.endTokenIndex,
        vocabularyId: expressionOccurrences.vocabularyId,
        meaningId: expressionOccurrences.meaningId,
        pronunciationId: expressionOccurrences.pronunciationId,
        contextMeaningKo: expressionOccurrences.contextMeaningKo,
        pronunciationKo: expressionPronunciations.pronunciationKo,
        toneMarks: expressionPronunciations.toneMarks,
        mediaStorageKey: expressionMediaAssets.storageKey,
        representative: expressionOccurrences.representative,
      })
      .from(expressionOccurrences)
      .innerJoin(
        expressionPronunciations,
        and(
          eq(
            expressionOccurrences.pronunciationId,
            expressionPronunciations.id,
          ),
          eq(
            expressionOccurrences.vocabularyId,
            expressionPronunciations.vocabularyId,
          ),
        ),
      )
      .leftJoin(
        expressionMediaAssets,
        eq(expressionPronunciations.mediaAssetId, expressionMediaAssets.id),
      )
      .where(
        inArray(expressionOccurrences.sentenceVersionId, sentenceVersionIds),
      )
      .orderBy(
        asc(expressionOccurrences.sentenceVersionId),
        asc(expressionOccurrences.startTokenIndex),
        asc(expressionOccurrences.endTokenIndex),
        asc(expressionOccurrences.id),
      );

    return new Map(
      sentenceRows.map((sentence) => [
        sentence.sentenceVersionId,
        {
          sentenceVersionId: sentence.sentenceVersionId,
          originalText: sentence.originalText,
          translationKo: sentence.translationKo,
          pronunciationKo: sentence.pronunciationKo,
          toneMarks: sentence.toneMarks,
          media: { storageKey: sentence.mediaStorageKey },
          tokens: tokenRows
            .filter(
              (token) => token.sentenceVersionId === sentence.sentenceVersionId,
            )
            .sort(comparePosition)
            .map((token) => ({
              position: token.position,
              surface: token.surface,
              startOffset: token.startOffset,
              endOffset: token.endOffset,
              vocabularyId: token.vocabularyId,
              meaningId: token.meaningId,
              pronunciationId: token.pronunciationId,
              contextMeaningKo: token.contextMeaningKo,
              pronunciationKo: token.pronunciationKo,
              toneMarks: token.toneMarks,
              media:
                token.mediaStorageKey === null
                  ? null
                  : { storageKey: token.mediaStorageKey },
              role: token.role,
            })),
          expressions: expressionRows
            .filter(
              (expression) =>
                expression.sentenceVersionId === sentence.sentenceVersionId,
            )
            .sort(compareExpressionPosition)
            .map((expression) => ({
              startTokenIndex: expression.startTokenIndex,
              endTokenIndex: expression.endTokenIndex,
              vocabularyId: expression.vocabularyId,
              meaningId: expression.meaningId,
              pronunciationId: expression.pronunciationId,
              contextMeaningKo: expression.contextMeaningKo,
              pronunciationKo: expression.pronunciationKo,
              toneMarks: expression.toneMarks,
              media:
                expression.mediaStorageKey === null
                  ? null
                  : { storageKey: expression.mediaStorageKey },
              representative: expression.representative,
            })),
        },
      ]),
    );
  }

  private assembleBlocks(
    blockRows: Awaited<
      ReturnType<DrizzleLearnerQuestionQuery['loadBlockRows']>
    >,
    blockSentenceRows: Awaited<
      ReturnType<DrizzleLearnerQuestionQuery['loadBlockSentenceRows']>
    >,
    sentences: Map<string, LearnerQuestionSentenceProjection>,
  ): LearnerQuestionBlockProjection[] {
    return blockRows.sort(comparePosition).map((block) => ({
      id: block.id,
      kind: block.kind,
      displayMode: block.displayMode,
      position: block.position,
      sentences: blockSentenceRows
        .filter((blockSentence) => blockSentence.blockId === block.id)
        .sort(comparePosition)
        .map((blockSentence) => ({
          position: blockSentence.position,
          speaker: blockSentence.speaker,
          sentence: requireSentence(sentences, blockSentence.sentenceVersionId),
        })),
    }));
  }
}

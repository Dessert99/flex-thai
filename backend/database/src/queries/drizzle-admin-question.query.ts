/** 관리자 문제의 모든 상태·버전·검증·정답 ref를 stable read model로 조회한다 */
import type { QuestionValidationIssue } from '@flex-thia/domain';
import { and, asc, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionTypes,
  questionTypeVersions,
  questionVersions,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type AdminQuestionDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 관리자 문제 목록이 지원하는 모든 상태와 유형 필터 */
export interface AdminQuestionListQuery {
  status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  versionStatus?: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'INVALIDATED';
  validationStatus?: 'PENDING' | 'PASSED' | 'FAILED';
  questionTypeSlug?: string;
  skill?: 'READING' | 'LISTENING';
  difficulty?: number;
  page: number;
  pageSize: number;
}

/** 관리자 문제 목록의 latest version 한 건 */
export interface AdminQuestionListItemProjection {
  questionId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  currentPublishedVersionId: string | null;
  latestVersion: number;
  latestVersionId: string;
  latestVersionStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'INVALIDATED';
  validationStatus: 'PENDING' | 'PASSED' | 'FAILED';
  questionTypeSlug: string;
  difficulty: number;
  updatedAt: Date;
}

/** 관리자 문제 목록의 stable page metadata */
export interface AdminQuestionPageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** 관리자 문제 목록 page projection */
export interface AdminQuestionListProjection {
  items: AdminQuestionListItemProjection[];
  page: AdminQuestionPageMetadata;
}

/** 관리자 상세의 버전별 저장된 validation 상태 */
export type AdminQuestionValidationProjection =
  | { status: 'PENDING'; issues: []; validatedAt: null }
  | { status: 'PASSED'; issues: []; validatedAt: Date }
  | {
      status: 'FAILED';
      issues: QuestionValidationIssue[];
      validatedAt: Date;
    };

/** 관리자 상세의 block 안 sentence version 불변 참조 */
export interface AdminQuestionBlockSentenceProjection {
  position: number;
  speaker: string | null;
  sentenceVersionId: string;
}

/** 관리자 상세의 버전 block */
export interface AdminQuestionBlockProjection {
  id: string;
  kind: 'INSTRUCTION' | 'PASSAGE' | 'DIALOGUE' | 'QUESTION' | 'EXPLANATION';
  displayMode: 'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO' | 'AUDIO_THEN_REVEAL';
  position: number;
  sentences: AdminQuestionBlockSentenceProjection[];
}

/** isCorrect 대신 관리자 공개 정답 ID를 조립할 option */
export interface AdminQuestionOptionProjection {
  id: string;
  position: number;
  sentenceVersionId: string;
  span: {
    sentenceVersionId: string;
    startTokenIndex: number;
    endTokenIndex: number;
  } | null;
}

/** 문제 유형 version과 템플릿을 고정한 관리자 projection */
export interface AdminQuestionTypeVersionProjection {
  id: string;
  slug: string;
  version: number;
  skill: 'READING' | 'LISTENING';
  template:
    | 'STANDARD_CHOICE'
    | 'PASSAGE_CHOICE'
    | 'DIALOGUE_CHOICE'
    | 'INLINE_SPAN_CHOICE';
}

/** 관리자 상세의 불변 문제 버전 projection */
export interface AdminQuestionVersionDetailProjection {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'INVALIDATED';
  validation: AdminQuestionValidationProjection;
  questionType: AdminQuestionTypeVersionProjection;
  difficulty: number;
  blocks: AdminQuestionBlockProjection[];
  options: AdminQuestionOptionProjection[];
  correctOptionId: string;
  createdAt: Date;
  publishedAt: Date | null;
}

/** 모든 버전을 포함한 관리자 문제 상세 projection */
export interface AdminQuestionDetailProjection {
  questionId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  currentPublishedVersionId: string | null;
  versions: AdminQuestionVersionDetailProjection[];
  createdAt: Date;
  updatedAt: Date;
}

/** DB 저장 상태가 관리자 공개 계약을 만족하지 않음을 stable code로 전달한다 */
export class AdminQuestionQueryError extends Error {
  readonly code = 'ADMIN_QUESTION_QUERY_INTEGRITY_ERROR';

  constructor(readonly operation: string) {
    super(`ADMIN_QUESTION_QUERY_INTEGRITY_ERROR:${operation}`);
    this.name = 'AdminQuestionQueryError';
  }
}

const comparePosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

const toValidation = (row: {
  validationStatus: 'PENDING' | 'PASSED' | 'FAILED';
  validationIssues: QuestionValidationIssue[];
  validatedAt: Date | null;
}): AdminQuestionValidationProjection => {
  if (
    row.validationStatus === 'PENDING' &&
    row.validationIssues.length === 0 &&
    row.validatedAt === null
  ) {
    return { status: 'PENDING', issues: [], validatedAt: null };
  }
  if (
    row.validationStatus === 'PASSED' &&
    row.validationIssues.length === 0 &&
    row.validatedAt !== null
  ) {
    return {
      status: 'PASSED',
      issues: [],
      validatedAt: row.validatedAt,
    };
  }
  if (
    row.validationStatus === 'FAILED' &&
    row.validationIssues.length > 0 &&
    row.validatedAt !== null
  ) {
    return {
      status: 'FAILED',
      issues: row.validationIssues,
      validatedAt: row.validatedAt,
    };
  }
  throw new AdminQuestionQueryError('mapValidation');
};

const latestVersions = (database: AdminQuestionDatabase, alias: string) =>
  database
    .select({
      questionId: questionVersions.questionId,
      latestVersion: sql<number>`max(${questionVersions.version})`.as(
        'latest_version',
      ),
    })
    .from(questionVersions)
    .groupBy(questionVersions.questionId)
    .as(alias);

const listSelection = {
  questionId: questions.id,
  status: questions.status,
  currentPublishedVersionId: questions.currentPublishedVersionId,
  latestVersion: questionVersions.version,
  latestVersionId: questionVersions.id,
  latestVersionStatus: questionVersions.status,
  validationStatus: questionVersions.validationStatus,
  questionTypeSlug: questionTypes.slug,
  difficulty: questionVersions.difficulty,
  updatedAt: questions.updatedAt,
};

/** public 관리자 계약에 필요한 문제·버전 필드만 조회한다 */
export class DrizzleAdminQuestionQuery {
  constructor(private readonly database: AdminQuestionDatabase) {}

  /** latest version 기준 필터와 updatedAt·ID stable page를 반환한다 */
  async list(
    query: AdminQuestionListQuery,
  ): Promise<AdminQuestionListProjection> {
    const countLatest = latestVersions(this.database, 'count_latest_versions');
    const countConditions: Array<SQL<unknown> | undefined> = [
      query.status ? eq(questions.status, query.status) : undefined,
      query.versionStatus
        ? eq(questionVersions.status, query.versionStatus)
        : undefined,
      query.validationStatus
        ? eq(questionVersions.validationStatus, query.validationStatus)
        : undefined,
      query.questionTypeSlug
        ? eq(questionTypes.slug, query.questionTypeSlug)
        : undefined,
      query.skill ? eq(questionTypes.skill, query.skill) : undefined,
      query.difficulty
        ? eq(questionVersions.difficulty, query.difficulty)
        : undefined,
    ];
    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(questions)
      .innerJoin(countLatest, eq(questions.id, countLatest.questionId))
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, countLatest.questionId),
          eq(questionVersions.version, countLatest.latestVersion),
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
      .where(and(...countConditions));

    const listLatest = latestVersions(this.database, 'list_latest_versions');
    const listConditions: Array<SQL<unknown> | undefined> = [
      query.status ? eq(questions.status, query.status) : undefined,
      query.versionStatus
        ? eq(questionVersions.status, query.versionStatus)
        : undefined,
      query.validationStatus
        ? eq(questionVersions.validationStatus, query.validationStatus)
        : undefined,
      query.questionTypeSlug
        ? eq(questionTypes.slug, query.questionTypeSlug)
        : undefined,
      query.skill ? eq(questionTypes.skill, query.skill) : undefined,
      query.difficulty
        ? eq(questionVersions.difficulty, query.difficulty)
        : undefined,
    ];
    const rows = await this.database
      .select(listSelection)
      .from(questions)
      .innerJoin(listLatest, eq(questions.id, listLatest.questionId))
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, listLatest.questionId),
          eq(questionVersions.version, listLatest.latestVersion),
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
      .where(and(...listConditions))
      .orderBy(desc(questions.updatedAt), desc(questions.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const totalItems = totalRow?.totalItems ?? 0;
    return {
      items: rows,
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  /** 모든 version의 validation·block·option 정답 ID를 private field 없이 반환한다 */
  async findById(
    questionId: string,
  ): Promise<AdminQuestionDetailProjection | null> {
    const [question] = await this.database
      .select({
        questionId: questions.id,
        status: questions.status,
        currentPublishedVersionId: questions.currentPublishedVersionId,
        createdAt: questions.createdAt,
        updatedAt: questions.updatedAt,
      })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);
    if (!question) return null;

    const versionRows = await this.database
      .select({
        id: questionVersions.id,
        version: questionVersions.version,
        status: questionVersions.status,
        validationStatus: questionVersions.validationStatus,
        validationIssues: questionVersions.validationIssues,
        validatedAt: questionVersions.validatedAt,
        typeVersionId: questionTypeVersions.id,
        questionTypeSlug: questionTypes.slug,
        questionTypeVersion: questionTypeVersions.version,
        skill: questionTypes.skill,
        template: questionTypeVersions.template,
        difficulty: questionVersions.difficulty,
        createdAt: questionVersions.createdAt,
        publishedAt: questionVersions.publishedAt,
      })
      .from(questionVersions)
      .innerJoin(
        questionTypeVersions,
        eq(questionVersions.typeVersionId, questionTypeVersions.id),
      )
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .where(eq(questionVersions.questionId, questionId))
      .orderBy(desc(questionVersions.version), desc(questionVersions.id));
    if (versionRows.length === 0) {
      throw new AdminQuestionQueryError('findById.versions');
    }
    const versionIds = versionRows.map(({ id }) => id);
    const blockRows = await this.database
      .select({
        id: questionBlocks.id,
        questionVersionId: questionBlocks.questionVersionId,
        kind: questionBlocks.kind,
        displayMode: questionBlocks.displayMode,
        position: questionBlocks.position,
      })
      .from(questionBlocks)
      .where(inArray(questionBlocks.questionVersionId, versionIds))
      .orderBy(
        asc(questionBlocks.questionVersionId),
        asc(questionBlocks.position),
        asc(questionBlocks.id),
      );
    const blockSentenceRows = await this.database
      .select({
        blockId: questionBlockSentences.blockId,
        sentenceVersionId: questionBlockSentences.sentenceVersionId,
        position: questionBlockSentences.position,
        speaker: questionBlockSentences.speaker,
      })
      .from(questionBlockSentences)
      .innerJoin(
        questionBlocks,
        eq(questionBlockSentences.blockId, questionBlocks.id),
      )
      .where(inArray(questionBlocks.questionVersionId, versionIds))
      .orderBy(
        asc(questionBlocks.questionVersionId),
        asc(questionBlocks.position),
        asc(questionBlockSentences.position),
      );
    const optionRows = await this.database
      .select({
        id: questionOptions.id,
        questionVersionId: questionOptions.questionVersionId,
        sentenceVersionId: questionOptions.sentenceVersionId,
        position: questionOptions.position,
        isCorrect: questionOptions.isCorrect,
        spanSentenceVersionId: questionOptions.spanSentenceVersionId,
        spanStartTokenIndex: questionOptions.spanStartTokenIndex,
        spanEndTokenIndex: questionOptions.spanEndTokenIndex,
      })
      .from(questionOptions)
      .where(inArray(questionOptions.questionVersionId, versionIds))
      .orderBy(
        asc(questionOptions.questionVersionId),
        asc(questionOptions.position),
        asc(questionOptions.id),
      );

    return {
      ...question,
      versions: versionRows.map((version) => {
        const blocks = blockRows
          .filter(({ questionVersionId }) => questionVersionId === version.id)
          .sort(comparePosition)
          .map((block) => ({
            id: block.id,
            kind: block.kind,
            displayMode: block.displayMode,
            position: block.position,
            sentences: blockSentenceRows
              .filter(({ blockId }) => blockId === block.id)
              .sort(comparePosition)
              .map(({ position, speaker, sentenceVersionId }) => ({
                position,
                speaker,
                sentenceVersionId,
              })),
          }));
        const storedOptions = optionRows
          .filter(({ questionVersionId }) => questionVersionId === version.id)
          .sort(comparePosition);
        const correctOptions = storedOptions.filter(
          ({ isCorrect }) => isCorrect,
        );
        if (correctOptions.length !== 1) {
          throw new AdminQuestionQueryError('findById.correctOption');
        }
        return {
          id: version.id,
          version: version.version,
          status: version.status,
          validation: toValidation(version),
          questionType: {
            id: version.typeVersionId,
            slug: version.questionTypeSlug,
            version: version.questionTypeVersion,
            skill: version.skill,
            template: version.template,
          },
          difficulty: version.difficulty,
          blocks,
          options: storedOptions.map((option) => ({
            id: option.id,
            position: option.position,
            sentenceVersionId: option.sentenceVersionId,
            span:
              option.spanSentenceVersionId === null
                ? null
                : {
                    sentenceVersionId: option.spanSentenceVersionId,
                    startTokenIndex: option.spanStartTokenIndex!,
                    endTokenIndex: option.spanEndTokenIndex!,
                  },
          })),
          correctOptionId: correctOptions[0]!.id,
          createdAt: version.createdAt,
          publishedAt: version.publishedAt,
        };
      }),
    };
  }
}

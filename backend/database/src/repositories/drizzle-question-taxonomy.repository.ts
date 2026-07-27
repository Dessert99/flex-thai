/** 문제 분류 설정의 불변 lifecycle을 Drizzle transaction으로 저장한다 */
import { randomUUID } from 'node:crypto';
import type {
  CreateQuestionTypeInput,
  QuestionApprovedExampleSnapshot,
  QuestionMajorCategory,
  QuestionTaxonomyRepository,
  QuestionTypeVersionRecord,
} from '@flex-thia/domain';
import { QuestionTaxonomyError } from '@flex-thia/domain';
import { and, count, eq, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionTags,
  questionTopics,
  questionTypeApprovedExamples,
  questionTypeDifficultyCriteria,
  questionTypes,
  questionTypeVersions,
} from '../schema/questions.schema.js';

type TaxonomySchema = {
  questionTags: typeof questionTags;
  questionTopics: typeof questionTopics;
  questionTypeApprovedExamples: typeof questionTypeApprovedExamples;
  questionTypeDifficultyCriteria: typeof questionTypeDifficultyCriteria;
  questionTypes: typeof questionTypes;
  questionTypeVersions: typeof questionTypeVersions;
};
type TaxonomyDatabase = PgDatabase<PgQueryResultHKT, TaxonomySchema>;
type TaxonomySession = Pick<
  TaxonomyDatabase,
  'delete' | 'insert' | 'select' | 'update'
>;

const TAXONOMY_UNIQUE_CONSTRAINTS = new Set([
  'question_types_slug_unique',
  'question_topics_slug_unique',
  'question_tags_slug_unique',
  'question_type_approved_examples_payload_unique',
  'question_type_versions_type_version_unique',
  'question_type_versions_one_active_per_type',
]);

const rethrowTaxonomyPersistenceError = (error: unknown): never => {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    'constraint' in error &&
    error.code === '23505' &&
    typeof error.constraint === 'string' &&
    TAXONOMY_UNIQUE_CONSTRAINTS.has(error.constraint)
  ) {
    throw new QuestionTaxonomyError('TAXONOMY_CONFLICT');
  }
  throw error;
};

/** 대분류에 맞는 첫 유형 버전 형식을 결정한다 */
export const defaultQuestionTypeVersionSettings = (
  category: QuestionMajorCategory,
): {
  template:
    | 'STANDARD_CHOICE'
    | 'PASSAGE_CHOICE'
    | 'DIALOGUE_CHOICE'
    | 'INLINE_SPAN_CHOICE';
  optionCount: 3 | 4;
  decisionRules: Record<string, unknown>;
} => {
  const template =
    category === 'LISTENING_DIALOGUE'
      ? 'DIALOGUE_CHOICE'
      : category === 'LISTENING_PASSAGE' || category === 'READING_PASSAGE'
        ? 'PASSAGE_CHOICE'
        : category === 'READING_ERROR_IDENTIFICATION'
          ? 'INLINE_SPAN_CHOICE'
          : 'STANDARD_CHOICE';
  return {
    template,
    optionCount: category === 'LISTENING_RESPONSE' ? 3 : 4,
    decisionRules: { mode: 'single-choice' },
  };
};

const loadVersion = async (
  session: TaxonomySession,
  versionId: string,
): Promise<QuestionTypeVersionRecord | null> => {
  const [version] = await session
    .select({
      id: questionTypeVersions.id,
      questionTypeId: questionTypeVersions.questionTypeId,
      questionTypeSlug: questionTypes.slug,
      version: questionTypeVersions.version,
      status: questionTypeVersions.status,
      template: questionTypeVersions.template,
      optionCount: questionTypeVersions.optionCount,
      decisionRules: questionTypeVersions.decisionRules,
    })
    .from(questionTypeVersions)
    .innerJoin(
      questionTypes,
      eq(questionTypeVersions.questionTypeId, questionTypes.id),
    )
    .where(eq(questionTypeVersions.id, versionId))
    .limit(1);
  if (!version) return null;
  const criteria = await session
    .select({
      difficulty: questionTypeDifficultyCriteria.difficulty,
      criteria: questionTypeDifficultyCriteria.criteria,
    })
    .from(questionTypeDifficultyCriteria)
    .where(eq(questionTypeDifficultyCriteria.typeVersionId, versionId));
  const examples = await session
    .select({
      id: questionTypeApprovedExamples.id,
      title: questionTypeApprovedExamples.title,
      payloadHash: questionTypeApprovedExamples.payloadHash,
      payload: questionTypeApprovedExamples.payload,
    })
    .from(questionTypeApprovedExamples)
    .where(eq(questionTypeApprovedExamples.typeVersionId, versionId));
  return {
    ...version,
    optionCount: version.optionCount as 3 | 4,
    difficultyCriteria: criteria.sort(
      (left, right) => left.difficulty - right.difficulty,
    ),
    approvedExamples: examples.map((example) => ({
      ...example,
      payload: example.payload as QuestionApprovedExampleSnapshot['payload'],
    })),
  };
};

/** local PostgreSQL과 Data API가 공유하는 taxonomy 저장 adapter */
export class DrizzleQuestionTaxonomyRepository implements QuestionTaxonomyRepository {
  constructor(private readonly database: TaxonomyDatabase) {}

  /** 논리 유형과 v1 DRAFT를 원자 생성한다 */
  async createQuestionTypeWithDraft(
    input: CreateQuestionTypeInput,
  ): Promise<unknown> {
    try {
      return await this.database.transaction(async (transaction) => {
        const questionTypeId = randomUUID();
        await transaction.insert(questionTypes).values({
          id: questionTypeId,
          slug: input.slug,
          displayName: input.displayName,
          skill: input.skill,
          majorCategory: input.majorCategory,
        });
        const settings = defaultQuestionTypeVersionSettings(
          input.majorCategory,
        );
        const versionId = randomUUID();
        await transaction.insert(questionTypeVersions).values({
          id: versionId,
          questionTypeId,
          version: 1,
          status: 'DRAFT',
          ...settings,
        });
        return { questionTypeId, versionId, version: 1, status: 'DRAFT' };
      });
    } catch (error) {
      return rethrowTaxonomyPersistenceError(error);
    }
  }

  /** max version 다음 DRAFT를 생성한다 */
  async createNextDraft(
    questionTypeId: string,
    input: Parameters<QuestionTaxonomyRepository['createNextDraft']>[1],
  ): Promise<unknown> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [row] = await transaction
          .select({
            nextVersion: sql<number>`coalesce(max(${questionTypeVersions.version}), 0) + 1`,
          })
          .from(questionTypeVersions)
          .where(eq(questionTypeVersions.questionTypeId, questionTypeId));
        const version = Number(row?.nextVersion ?? 1);
        const id = randomUUID();
        await transaction.insert(questionTypeVersions).values({
          id,
          questionTypeId,
          version,
          status: 'DRAFT',
          ...input,
        });
        return { id, version, status: 'DRAFT' };
      });
    } catch (error) {
      return rethrowTaxonomyPersistenceError(error);
    }
  }

  /** 유형 버전과 준비 조건을 조회한다 */
  findVersion(versionId: string): Promise<QuestionTypeVersionRecord | null> {
    return loadVersion(this.database, versionId);
  }

  /** DRAFT의 1~5 난이도 기준을 전체 교체한다 */
  replaceDifficultyCriteria(
    versionId: string,
    criteria: Parameters<
      QuestionTaxonomyRepository['replaceDifficultyCriteria']
    >[1],
  ): ReturnType<QuestionTaxonomyRepository['replaceDifficultyCriteria']> {
    return this.database.transaction(async (transaction) => {
      const locked = await lockDraftVersion(transaction, versionId);
      if (locked !== 'DRAFT') return locked;
      await transaction
        .delete(questionTypeDifficultyCriteria)
        .where(eq(questionTypeDifficultyCriteria.typeVersionId, versionId));
      await transaction.insert(questionTypeDifficultyCriteria).values(
        criteria.map((criterion) => ({
          typeVersionId: versionId,
          ...criterion,
        })),
      );
      return 'UPDATED';
    });
  }

  /** 검증된 canonical 예시 snapshot을 추가한다 */
  async addApprovedExample(
    versionId: string,
    example: QuestionApprovedExampleSnapshot,
  ): Promise<'UPDATED' | 'NOT_FOUND' | 'IMMUTABLE'> {
    try {
      return await this.database.transaction(async (transaction) => {
        const locked = await lockDraftVersion(transaction, versionId);
        if (locked !== 'DRAFT') return locked;
        await transaction.insert(questionTypeApprovedExamples).values({
          typeVersionId: versionId,
          title: example.title,
          payloadHash: example.payloadHash,
          payload: example.payload,
        });
        return 'UPDATED';
      });
    } catch (error) {
      return rethrowTaxonomyPersistenceError(error);
    }
  }

  /** DRAFT의 예시 snapshot을 제거한다 */
  removeApprovedExample(
    versionId: string,
    exampleId: string,
  ): ReturnType<QuestionTaxonomyRepository['removeApprovedExample']> {
    return this.database.transaction(async (transaction) => {
      const locked = await lockDraftVersion(transaction, versionId);
      if (locked !== 'DRAFT') return locked;
      await transaction
        .delete(questionTypeApprovedExamples)
        .where(
          and(
            eq(questionTypeApprovedExamples.id, exampleId),
            eq(questionTypeApprovedExamples.typeVersionId, versionId),
          ),
        );
      return 'UPDATED';
    });
  }

  /** 이전 ACTIVE retire와 새 ACTIVE 전환을 한 transaction에서 수행한다 */
  async activateVersion(
    versionId: string,
  ): ReturnType<QuestionTaxonomyRepository['activateVersion']> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [target] = await transaction
          .select({
            questionTypeId: questionTypeVersions.questionTypeId,
            status: questionTypeVersions.status,
          })
          .from(questionTypeVersions)
          .where(eq(questionTypeVersions.id, versionId))
          .for('update')
          .limit(1);
        if (!target) return 'NOT_FOUND';
        if (target.status !== 'DRAFT') return 'IMMUTABLE';
        const [{ total: criteriaCount = 0 } = {}] = await transaction
          .select({ total: count(questionTypeDifficultyCriteria.difficulty) })
          .from(questionTypeDifficultyCriteria)
          .where(
            and(
              eq(questionTypeDifficultyCriteria.typeVersionId, versionId),
              sql`length(trim(${questionTypeDifficultyCriteria.criteria})) > 0`,
            ),
          );
        const [{ total: exampleCount = 0 } = {}] = await transaction
          .select({ total: count(questionTypeApprovedExamples.id) })
          .from(questionTypeApprovedExamples)
          .where(eq(questionTypeApprovedExamples.typeVersionId, versionId));
        if (criteriaCount !== 5 || exampleCount < 1) return 'NOT_READY';
        await transaction
          .update(questionTypeVersions)
          .set({ status: 'RETIRED' })
          .where(
            and(
              eq(questionTypeVersions.questionTypeId, target.questionTypeId),
              eq(questionTypeVersions.status, 'ACTIVE'),
            ),
          );
        const updated = await transaction
          .update(questionTypeVersions)
          .set({ status: 'ACTIVE' })
          .where(
            and(
              eq(questionTypeVersions.id, versionId),
              eq(questionTypeVersions.status, 'DRAFT'),
            ),
          )
          .returning({ id: questionTypeVersions.id });
        if (updated.length !== 1) {
          throw new Error('QUESTION_TYPE_VERSION_TRANSITION_CONFLICT');
        }
        return 'ACTIVATED';
      });
    } catch (error) {
      return rethrowTaxonomyPersistenceError(error);
    }
  }

  /** ACTIVE 유형 버전을 RETIRED로 전환한다 */
  async retireVersion(versionId: string): Promise<void> {
    await this.database
      .update(questionTypeVersions)
      .set({ status: 'RETIRED' })
      .where(
        and(
          eq(questionTypeVersions.id, versionId),
          eq(questionTypeVersions.status, 'ACTIVE'),
        ),
      );
  }

  /** 선택 가능한 주제 또는 태그를 만든다 */
  async createTerm(
    kind: Parameters<QuestionTaxonomyRepository['createTerm']>[0],
    input: Parameters<QuestionTaxonomyRepository['createTerm']>[1],
  ): Promise<unknown> {
    try {
      return await (kind === 'TOPIC'
        ? this.database
            .insert(questionTopics)
            .values({ ...input, status: 'ACTIVE' })
            .returning()
        : this.database
            .insert(questionTags)
            .values({ ...input, status: 'ACTIVE' })
            .returning());
    } catch (error) {
      return rethrowTaxonomyPersistenceError(error);
    }
  }

  /** 주제 또는 태그를 신규 선택 목록에서 보관 처리한다 */
  async archiveTerm(
    kind: Parameters<QuestionTaxonomyRepository['archiveTerm']>[0],
    termId: string,
  ): Promise<void> {
    if (kind === 'TOPIC') {
      await this.database
        .update(questionTopics)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(eq(questionTopics.id, termId));
      return;
    }
    await this.database
      .update(questionTags)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(questionTags.id, termId));
  }
}

const lockDraftVersion = async (
  transaction: TaxonomySession,
  versionId: string,
): Promise<'DRAFT' | 'NOT_FOUND' | 'IMMUTABLE'> => {
  const [version] = await transaction
    .select({ status: questionTypeVersions.status })
    .from(questionTypeVersions)
    .where(eq(questionTypeVersions.id, versionId))
    .for('update')
    .limit(1);
  if (!version) return 'NOT_FOUND';
  return version.status === 'DRAFT' ? 'DRAFT' : 'IMMUTABLE';
};

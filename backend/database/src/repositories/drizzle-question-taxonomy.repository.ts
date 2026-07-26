/** 문제 분류 설정의 불변 lifecycle을 Drizzle transaction으로 저장한다 */
import { randomUUID } from 'node:crypto';
import type {
  CreateQuestionTypeInput,
  QuestionApprovedExampleSnapshot,
  QuestionMajorCategory,
  QuestionTaxonomyRepository,
  QuestionTypeVersionRecord,
} from '@flex-thia/domain';
import { and, eq, sql } from 'drizzle-orm';
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

const taxonomySchema = {
  questionTags,
  questionTopics,
  questionTypeApprovedExamples,
  questionTypeDifficultyCriteria,
  questionTypes,
  questionTypeVersions,
};
type TaxonomyDatabase = PgDatabase<PgQueryResultHKT, typeof taxonomySchema>;
type TaxonomySession = Pick<
  TaxonomyDatabase,
  'delete' | 'insert' | 'select' | 'update'
>;

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
    .select()
    .from(questionTypeVersions)
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
      payload:
        example.payload as QuestionApprovedExampleSnapshot['payload'],
    })),
  };
};

/** local PostgreSQL과 Data API가 공유하는 taxonomy 저장 adapter */
export class DrizzleQuestionTaxonomyRepository
  implements QuestionTaxonomyRepository
{
  constructor(private readonly database: TaxonomyDatabase) {}

  /** 논리 유형과 v1 DRAFT를 원자 생성한다 */
  createQuestionTypeWithDraft(input: CreateQuestionTypeInput): Promise<unknown> {
    return this.database.transaction(async (transaction) => {
      const questionTypeId = randomUUID();
      await transaction.insert(questionTypes).values({
        id: questionTypeId,
        slug: input.slug,
        displayName: input.displayName,
        skill: input.skill,
        majorCategory: input.majorCategory,
      });
      const settings = defaultQuestionTypeVersionSettings(input.majorCategory);
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
  }

  /** max version 다음 DRAFT를 생성한다 */
  createNextDraft(
    questionTypeId: string,
    input: Parameters<QuestionTaxonomyRepository['createNextDraft']>[1],
  ): Promise<unknown> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({ nextVersion: sql<number>`coalesce(max(${questionTypeVersions.version}), 0) + 1` })
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
  ): Promise<void> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .delete(questionTypeDifficultyCriteria)
        .where(eq(questionTypeDifficultyCriteria.typeVersionId, versionId));
      await transaction.insert(questionTypeDifficultyCriteria).values(
        criteria.map((criterion) => ({
          typeVersionId: versionId,
          ...criterion,
        })),
      );
    });
  }

  /** 검증된 canonical 예시 snapshot을 추가한다 */
  async addApprovedExample(
    versionId: string,
    example: QuestionApprovedExampleSnapshot,
  ): Promise<void> {
    await this.database.insert(questionTypeApprovedExamples).values({
      typeVersionId: versionId,
      title: example.title,
      payloadHash: example.payloadHash,
      payload: example.payload,
    });
  }

  /** DRAFT의 예시 snapshot을 제거한다 */
  async removeApprovedExample(
    versionId: string,
    exampleId: string,
  ): Promise<void> {
    await this.database
      .delete(questionTypeApprovedExamples)
      .where(
        and(
          eq(questionTypeApprovedExamples.id, exampleId),
          eq(questionTypeApprovedExamples.typeVersionId, versionId),
        ),
      );
  }

  /** 이전 ACTIVE retire와 새 ACTIVE 전환을 한 transaction에서 수행한다 */
  activateVersion(versionId: string): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const [target] = await transaction
        .select({
          questionTypeId: questionTypeVersions.questionTypeId,
          status: questionTypeVersions.status,
        })
        .from(questionTypeVersions)
        .where(eq(questionTypeVersions.id, versionId))
        .for('update')
        .limit(1);
      if (!target || target.status !== 'DRAFT') {
        throw new Error('QUESTION_TYPE_VERSION_TRANSITION_CONFLICT');
      }
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
    });
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
  createTerm(
    kind: Parameters<QuestionTaxonomyRepository['createTerm']>[0],
    input: Parameters<QuestionTaxonomyRepository['createTerm']>[1],
  ): Promise<unknown> {
    return kind === 'TOPIC'
      ? this.database
          .insert(questionTopics)
          .values({ ...input, status: 'ACTIVE' })
          .returning()
      : this.database
          .insert(questionTags)
          .values({ ...input, status: 'ACTIVE' })
          .returning();
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

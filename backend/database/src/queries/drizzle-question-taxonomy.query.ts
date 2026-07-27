/** 관리자 문제 분류 설정의 전체 read model을 조회한다 */
import { asc } from 'drizzle-orm';
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

type TypeRow = Pick<
  typeof questionTypes.$inferSelect,
  'id' | 'slug' | 'displayName' | 'majorCategory'
>;
type VersionRow = Pick<
  typeof questionTypeVersions.$inferSelect,
  | 'id'
  | 'questionTypeId'
  | 'version'
  | 'status'
  | 'template'
  | 'optionCount'
  | 'decisionRules'
>;
type CriterionRow = Pick<
  typeof questionTypeDifficultyCriteria.$inferSelect,
  'typeVersionId' | 'difficulty' | 'criteria'
>;
type ExampleRow = Pick<
  typeof questionTypeApprovedExamples.$inferSelect,
  'id' | 'typeVersionId' | 'title' | 'payload'
>;
type TermRow = Pick<
  typeof questionTopics.$inferSelect,
  'id' | 'slug' | 'displayName' | 'status'
>;

/** flat row를 유형·버전 계층으로 조립한다 */
export const assembleQuestionTaxonomySettings = (
  typeRows: TypeRow[],
  versionRows: VersionRow[],
  criterionRows: CriterionRow[],
  exampleRows: ExampleRow[],
  topics: TermRow[],
  tags: TermRow[],
) => ({
  questionTypes: [...typeRows]
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((questionType) => ({
      ...questionType,
      versions: versionRows
        .filter(({ questionTypeId }) => questionTypeId === questionType.id)
        .sort((left, right) => right.version - left.version)
        .map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status,
          template: version.template,
          optionCount: version.optionCount as 3 | 4,
          decisionRules: version.decisionRules,
          difficultyCriteria: criterionRows
            .filter(({ typeVersionId }) => typeVersionId === version.id)
            .sort((left, right) => left.difficulty - right.difficulty)
            .map(({ difficulty, criteria }) => ({ difficulty, criteria })),
          approvedExamples: exampleRows
            .filter(({ typeVersionId }) => typeVersionId === version.id)
            .map(({ id, title, payload }) => ({ id, title, payload })),
        })),
    })),
  topics,
  tags,
});

type QuerySchema = {
  questionTags: typeof questionTags;
  questionTopics: typeof questionTopics;
  questionTypeApprovedExamples: typeof questionTypeApprovedExamples;
  questionTypeDifficultyCriteria: typeof questionTypeDifficultyCriteria;
  questionTypes: typeof questionTypes;
  questionTypeVersions: typeof questionTypeVersions;
};
type QueryDatabase = PgDatabase<PgQueryResultHKT, QuerySchema>;

/** 관리자 taxonomy 설정 전체 query */
export class DrizzleQuestionTaxonomyQuery {
  constructor(private readonly database: QueryDatabase) {}

  /** 유형·버전·기준·예시·topic·tag를 한 read model로 반환한다 */
  async findSettings() {
    const [types, versions, criteria, examples, topics, tags] =
      await Promise.all([
        this.database
          .select({
            id: questionTypes.id,
            slug: questionTypes.slug,
            displayName: questionTypes.displayName,
            majorCategory: questionTypes.majorCategory,
          })
          .from(questionTypes)
          .orderBy(asc(questionTypes.slug)),
        this.database
          .select({
            id: questionTypeVersions.id,
            questionTypeId: questionTypeVersions.questionTypeId,
            version: questionTypeVersions.version,
            status: questionTypeVersions.status,
            template: questionTypeVersions.template,
            optionCount: questionTypeVersions.optionCount,
            decisionRules: questionTypeVersions.decisionRules,
          })
          .from(questionTypeVersions)
          .orderBy(asc(questionTypeVersions.questionTypeId)),
        this.database
          .select({
            typeVersionId: questionTypeDifficultyCriteria.typeVersionId,
            difficulty: questionTypeDifficultyCriteria.difficulty,
            criteria: questionTypeDifficultyCriteria.criteria,
          })
          .from(questionTypeDifficultyCriteria)
          .orderBy(asc(questionTypeDifficultyCriteria.difficulty)),
        this.database
          .select({
            id: questionTypeApprovedExamples.id,
            typeVersionId: questionTypeApprovedExamples.typeVersionId,
            title: questionTypeApprovedExamples.title,
            payload: questionTypeApprovedExamples.payload,
          })
          .from(questionTypeApprovedExamples),
        this.database
          .select({
            id: questionTopics.id,
            slug: questionTopics.slug,
            displayName: questionTopics.displayName,
            status: questionTopics.status,
          })
          .from(questionTopics)
          .orderBy(asc(questionTopics.slug)),
        this.database
          .select({
            id: questionTags.id,
            slug: questionTags.slug,
            displayName: questionTags.displayName,
            status: questionTags.status,
          })
          .from(questionTags)
          .orderBy(asc(questionTags.slug)),
      ]);
    return assembleQuestionTaxonomySettings(
      types,
      versions,
      criteria,
      examples,
      topics,
      tags,
    );
  }
}

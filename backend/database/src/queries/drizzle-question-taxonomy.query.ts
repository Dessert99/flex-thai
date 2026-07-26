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
          ...version,
          optionCount: version.optionCount as 3 | 4,
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

const querySchema = {
  questionTags,
  questionTopics,
  questionTypeApprovedExamples,
  questionTypeDifficultyCriteria,
  questionTypes,
  questionTypeVersions,
};
type QueryDatabase = PgDatabase<PgQueryResultHKT, typeof querySchema>;

/** 관리자 taxonomy 설정 전체 query */
export class DrizzleQuestionTaxonomyQuery {
  constructor(private readonly database: QueryDatabase) {}

  /** 유형·버전·기준·예시·topic·tag를 한 read model로 반환한다 */
  async findSettings() {
    const [types, versions, criteria, examples, topics, tags] =
      await Promise.all([
        this.database.select().from(questionTypes).orderBy(asc(questionTypes.slug)),
        this.database
          .select()
          .from(questionTypeVersions)
          .orderBy(asc(questionTypeVersions.questionTypeId)),
        this.database
          .select()
          .from(questionTypeDifficultyCriteria)
          .orderBy(asc(questionTypeDifficultyCriteria.difficulty)),
        this.database.select().from(questionTypeApprovedExamples),
        this.database.select().from(questionTopics).orderBy(asc(questionTopics.slug)),
        this.database.select().from(questionTags).orderBy(asc(questionTags.slug)),
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

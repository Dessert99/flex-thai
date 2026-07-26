/** 관리자에게 개념의 모든 상태·버전·검증 정보를 조회한다 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  conceptBlockExamples,
  conceptBlocks,
  concepts,
  conceptVersions,
} from '../schema/concepts.schema.js';

const adminConceptSchema = {
  conceptBlockExamples,
  conceptBlocks,
  concepts,
  conceptVersions,
};
type AdminConceptDatabase = PgDatabase<
  PgQueryResultHKT,
  typeof adminConceptSchema
>;
type ConceptCategory = 'THAI_SCRIPT_PRONUNCIATION' | 'GRAMMAR';
type ConceptStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
type ValidationStatus = 'PENDING' | 'PASSED' | 'FAILED';

/** 관리자 개념 목록 조건 */
export interface AdminConceptListFilter {
  category?: ConceptCategory;
  status?: ConceptStatus;
  page: number;
  pageSize: number;
}

/** 관리자 개념 목록 항목 */
export interface AdminConceptListItem {
  id: string;
  status: ConceptStatus;
  category: ConceptCategory;
  position: number;
  title: string;
  latestVersion: number;
  validationStatus: ValidationStatus;
}

/** 관리자 개념 목록 page */
export interface AdminConceptListResult {
  items: AdminConceptListItem[];
  page: number;
  pageSize: number;
  total: number;
}

interface ConceptRow {
  id: string;
  status: ConceptStatus;
  currentPublishedVersionId: string | null;
}

export interface AdminConceptVersionRow {
  id: string;
  conceptId: string;
  version: number;
  revision: number;
  category: ConceptCategory;
  position: number;
  title: string;
  summary: string;
  status: VersionStatus;
  validationStatus: ValidationStatus;
  validationIssues: Array<{
    source: 'STRUCTURE' | 'REFERENCE' | 'EXTERNAL';
    path: string;
    code: string;
    evidenceKo: string;
  }>;
  validatedAt: Date | null;
  publishedAt: Date | null;
}

interface AdminBlockRow {
  id: string;
  conceptVersionId: string;
  kind: 'EXPLANATION' | 'RULE_TABLE' | 'THAI_EXAMPLES';
  position: number;
  heading: string;
  paragraphs: string[] | null;
  tableHeaders: string[] | null;
  tableRows: string[][] | null;
}

interface AdminExampleRow {
  blockId: string;
  position: number;
  sentenceVersionId: string;
  noteKo: string | null;
}

/** 관리자 상세의 개념 버전 */
export interface AdminConceptVersionDetail extends AdminConceptVersionRow {
  blocks: Array<
    | {
        id: string;
        kind: 'EXPLANATION';
        position: number;
        heading: string;
        paragraphs: string[];
      }
    | {
        id: string;
        kind: 'RULE_TABLE';
        position: number;
        heading: string;
        headers: string[];
        rows: string[][];
      }
    | {
        id: string;
        kind: 'THAI_EXAMPLES';
        position: number;
        heading: string;
        examples: Array<{
          position: number;
          sentenceVersionId: string;
          noteKo: string | null;
        }>;
      }
  >;
}

/** 관리자 개념 상세 */
export interface AdminConceptDetailRow extends ConceptRow {
  versions: AdminConceptVersionDetail[];
}

const byPosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

/** 관리자 category/status 목록 조건을 undefined 없이 만든다 */
export const buildAdminConceptConditions = (
  filter: AdminConceptListFilter,
): SQL[] => [
  ...(filter.status ? [eq(concepts.status, filter.status)] : []),
  ...(filter.category ? [eq(conceptVersions.category, filter.category)] : []),
];

/** 관리자 page의 SQL offset을 계산한다 */
export const adminConceptOffset = (filter: AdminConceptListFilter): number =>
  (filter.page - 1) * filter.pageSize;

/** 관리자 flat rows를 버전 내림차순 상세로 조립한다 */
export const assembleAdminConceptDetail = (
  concept: ConceptRow | null,
  versionRows: AdminConceptVersionRow[],
  blockRows: AdminBlockRow[],
  exampleRows: AdminExampleRow[],
): AdminConceptDetailRow | null => {
  if (!concept) return null;
  return {
    ...concept,
    versions: [...versionRows]
      .sort((left, right) => right.version - left.version)
      .map((version) => ({
        ...version,
        blocks: blockRows
          .filter(({ conceptVersionId }) => conceptVersionId === version.id)
          .sort(byPosition)
          .map((block) => {
            const base = {
              id: block.id,
              position: block.position,
              heading: block.heading,
            };
            if (block.kind === 'EXPLANATION') {
              return {
                ...base,
                kind: block.kind,
                paragraphs: block.paragraphs ?? [],
              };
            }
            if (block.kind === 'RULE_TABLE') {
              return {
                ...base,
                kind: block.kind,
                headers: block.tableHeaders ?? [],
                rows: block.tableRows ?? [],
              };
            }
            return {
              ...base,
              kind: block.kind,
              examples: exampleRows
                .filter(({ blockId }) => blockId === block.id)
                .sort(byPosition)
                .map(({ blockId: _blockId, ...example }) => example),
            };
          }),
      })),
  };
};

/** 관리자 개념 read query */
export class DrizzleAdminConceptQuery {
  constructor(private readonly database: AdminConceptDatabase) {}

  /** latest version 기준 필터와 stable page를 반환한다 */
  async list(
    filter: AdminConceptListFilter,
  ): Promise<AdminConceptListResult> {
    const latest = this.database
      .select({
        conceptId: conceptVersions.conceptId,
        version: sql<number>`max(${conceptVersions.version})`.as(
          'latest_version',
        ),
      })
      .from(conceptVersions)
      .groupBy(conceptVersions.conceptId)
      .as('latest_concept_versions');
    const conditions = buildAdminConceptConditions(filter);
    const [{ total = 0 } = { total: 0 }] = await this.database
      .select({ total: count() })
      .from(concepts)
      .innerJoin(latest, eq(latest.conceptId, concepts.id))
      .innerJoin(
        conceptVersions,
        and(
          eq(conceptVersions.conceptId, latest.conceptId),
          eq(conceptVersions.version, latest.version),
        ),
      )
      .where(and(...conditions));
    const items = await this.database
      .select({
        id: concepts.id,
        status: concepts.status,
        category: conceptVersions.category,
        position: conceptVersions.position,
        title: conceptVersions.title,
        latestVersion: conceptVersions.version,
        validationStatus: conceptVersions.validationStatus,
      })
      .from(concepts)
      .innerJoin(latest, eq(latest.conceptId, concepts.id))
      .innerJoin(
        conceptVersions,
        and(
          eq(conceptVersions.conceptId, latest.conceptId),
          eq(conceptVersions.version, latest.version),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(concepts.updatedAt), desc(concepts.id))
      .limit(filter.pageSize)
      .offset(adminConceptOffset(filter));
    return {
      items,
      page: filter.page,
      pageSize: filter.pageSize,
      total,
    };
  }

  /** 논리 개념과 모든 버전·블록·예시를 조회한다 */
  async findDetail(conceptId: string): Promise<AdminConceptDetailRow | null> {
    const [concept] = await this.database
      .select({
        id: concepts.id,
        status: concepts.status,
        currentPublishedVersionId: concepts.currentPublishedVersionId,
      })
      .from(concepts)
      .where(eq(concepts.id, conceptId))
      .limit(1);
    if (!concept) return null;
    const versions = await this.database
      .select({
        id: conceptVersions.id,
        conceptId: conceptVersions.conceptId,
        version: conceptVersions.version,
        revision: conceptVersions.revision,
        category: conceptVersions.category,
        position: conceptVersions.position,
        title: conceptVersions.title,
        summary: conceptVersions.summary,
        status: conceptVersions.status,
        validationStatus: conceptVersions.validationStatus,
        validationIssues: conceptVersions.validationIssues,
        validatedAt: conceptVersions.validatedAt,
        publishedAt: conceptVersions.publishedAt,
      })
      .from(conceptVersions)
      .where(eq(conceptVersions.conceptId, conceptId))
      .orderBy(desc(conceptVersions.version), desc(conceptVersions.id));
    const versionIds = versions.map(({ id }) => id);
    const blocks =
      versionIds.length === 0
        ? []
        : await this.database
            .select({
              id: conceptBlocks.id,
              conceptVersionId: conceptBlocks.conceptVersionId,
              kind: conceptBlocks.kind,
              position: conceptBlocks.position,
              heading: conceptBlocks.heading,
              paragraphs: conceptBlocks.paragraphs,
              tableHeaders: conceptBlocks.tableHeaders,
              tableRows: conceptBlocks.tableRows,
            })
            .from(conceptBlocks)
            .where(inArray(conceptBlocks.conceptVersionId, versionIds))
            .orderBy(
              asc(conceptBlocks.conceptVersionId),
              asc(conceptBlocks.position),
            );
    const blockIds = blocks.map(({ id }) => id);
    const examples =
      blockIds.length === 0
        ? []
        : await this.database
            .select({
              blockId: conceptBlockExamples.blockId,
              position: conceptBlockExamples.position,
              sentenceVersionId: conceptBlockExamples.sentenceVersionId,
              noteKo: conceptBlockExamples.noteKo,
            })
            .from(conceptBlockExamples)
            .where(inArray(conceptBlockExamples.blockId, blockIds))
            .orderBy(
              asc(conceptBlockExamples.blockId),
              asc(conceptBlockExamples.position),
            );
    return assembleAdminConceptDetail(concept, versions, blocks, examples);
  }
}

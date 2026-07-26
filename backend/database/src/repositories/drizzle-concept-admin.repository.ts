/** 관리자 개념 수명주기를 Drizzle transaction으로 구현한다 */
import { randomUUID } from 'node:crypto';
import type {
  ConceptAdminRepository,
  ConceptCandidateBlock,
  ConceptCommandContext,
  ConceptDomainErrorCode,
  ConceptDraftBlock,
  ConceptDraftRecord,
  ConceptValidationReport,
  ConceptValidationCandidate,
  ConceptValidationIssue,
  CreateConceptCommand,
  ReplaceConceptDraftCommand,
} from '@flex-thia/domain';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
} from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditLogs } from '../schema/identity.schema.js';
import { mediaAssets } from '../schema/media.schema.js';
import {
  conceptBlockExamples,
  conceptBlocks,
  concepts,
  conceptVersions,
} from '../schema/concepts.schema.js';
import { thaiSentenceVersions } from '../schema/thai-content.schema.js';

const conceptSchema = {
  auditLogs,
  mediaAssets,
  conceptBlockExamples,
  conceptBlocks,
  concepts,
  conceptVersions,
  thaiSentenceVersions,
};
type ConceptDatabase = PgDatabase<PgQueryResultHKT, typeof conceptSchema>;
type ConceptSession = Pick<
  ConceptDatabase,
  'delete' | 'insert' | 'select' | 'update'
>;

interface CandidateVersionRow {
  id: string;
  conceptId: string;
  revision: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  validationStatus: 'PENDING' | 'PASSED' | 'FAILED';
  validatedRevision: number | null;
  category: 'THAI_SCRIPT_PRONUNCIATION' | 'GRAMMAR';
  position: number;
  title: string;
  summary: string;
}

interface CandidateBlockRow {
  id: string;
  kind: 'EXPLANATION' | 'RULE_TABLE' | 'THAI_EXAMPLES';
  position: number;
  heading: string;
  paragraphs: string[] | null;
  tableHeaders: string[] | null;
  tableRows: string[][] | null;
}

interface CandidateExampleRow {
  blockId: string;
  position: number;
  sentenceVersionId: string;
  noteKo: string | null;
  sentenceExists: boolean;
  audioAssetExists: boolean;
  audioAssetStatus: 'UPLOADING' | 'READY' | 'REJECTED' | null;
}

/** 개념 저장 조건 충돌을 stable code로 전달한다 */
export class ConceptPersistenceError extends Error {
  constructor(readonly code: ConceptDomainErrorCode) {
    super(code);
    this.name = 'ConceptPersistenceError';
  }
}

const byPosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

/** DB flat rows를 position 순서의 검증 후보로 조립한다 */
export const assembleConceptValidationCandidate = (
  version: CandidateVersionRow,
  blockRows: CandidateBlockRow[],
  exampleRows: CandidateExampleRow[],
): ConceptValidationCandidate => ({
  ...version,
  blocks: [...blockRows].sort(byPosition).map((block): ConceptCandidateBlock => {
    if (block.kind === 'EXPLANATION') {
      return {
        kind: block.kind,
        position: block.position,
        heading: block.heading,
        paragraphs: block.paragraphs ?? [],
      };
    }
    if (block.kind === 'RULE_TABLE') {
      return {
        kind: block.kind,
        position: block.position,
        heading: block.heading,
        headers: block.tableHeaders ?? [],
        rows: block.tableRows ?? [],
      };
    }
    return {
      kind: block.kind,
      position: block.position,
      heading: block.heading,
      examples: exampleRows
        .filter(({ blockId }) => blockId === block.id)
        .sort(byPosition)
        .map(({ blockId: _blockId, ...example }) => example),
    };
  }),
});

const loadCandidate = async (
  session: ConceptSession,
  versionId: string,
): Promise<ConceptValidationCandidate | null> => {
  const [version] = await session
    .select({
      id: conceptVersions.id,
      conceptId: conceptVersions.conceptId,
      revision: conceptVersions.revision,
      status: conceptVersions.status,
      validationStatus: conceptVersions.validationStatus,
      validatedRevision: conceptVersions.validatedRevision,
      category: conceptVersions.category,
      position: conceptVersions.position,
      title: conceptVersions.title,
      summary: conceptVersions.summary,
    })
    .from(conceptVersions)
    .where(eq(conceptVersions.id, versionId))
    .limit(1);
  if (!version) return null;
  const blocks = await session
    .select({
      id: conceptBlocks.id,
      kind: conceptBlocks.kind,
      position: conceptBlocks.position,
      heading: conceptBlocks.heading,
      paragraphs: conceptBlocks.paragraphs,
      tableHeaders: conceptBlocks.tableHeaders,
      tableRows: conceptBlocks.tableRows,
    })
    .from(conceptBlocks)
    .where(eq(conceptBlocks.conceptVersionId, versionId))
    .orderBy(asc(conceptBlocks.position));
  const examples = await session
    .select({
      blockId: conceptBlockExamples.blockId,
      position: conceptBlockExamples.position,
      sentenceVersionId: conceptBlockExamples.sentenceVersionId,
      noteKo: conceptBlockExamples.noteKo,
      sentenceId: thaiSentenceVersions.id,
      mediaAssetId: mediaAssets.id,
      audioAssetStatus: mediaAssets.status,
    })
    .from(conceptBlockExamples)
    .innerJoin(
      conceptBlocks,
      eq(conceptBlockExamples.blockId, conceptBlocks.id),
    )
    .leftJoin(
      thaiSentenceVersions,
      eq(conceptBlockExamples.sentenceVersionId, thaiSentenceVersions.id),
    )
    .leftJoin(mediaAssets, eq(thaiSentenceVersions.mediaAssetId, mediaAssets.id))
    .where(eq(conceptBlocks.conceptVersionId, versionId))
    .orderBy(
      asc(conceptBlocks.position),
      asc(conceptBlockExamples.position),
    );
  return assembleConceptValidationCandidate(
    version,
    blocks,
    examples.map((row) => ({
      blockId: row.blockId,
      position: row.position,
      sentenceVersionId: row.sentenceVersionId,
      noteKo: row.noteKo,
      sentenceExists: row.sentenceId !== null,
      audioAssetExists: row.mediaAssetId !== null,
      audioAssetStatus: row.audioAssetStatus,
    })),
  );
};

const insertBlocks = async (
  session: ConceptSession,
  versionId: string,
  blocks: ConceptDraftBlock[],
): Promise<void> => {
  for (const block of [...blocks].sort(byPosition)) {
    const blockId = randomUUID();
    await session.insert(conceptBlocks).values({
      id: blockId,
      conceptVersionId: versionId,
      kind: block.kind,
      position: block.position,
      heading: block.heading,
      paragraphs: block.kind === 'EXPLANATION' ? block.paragraphs : null,
      tableHeaders: block.kind === 'RULE_TABLE' ? block.headers : null,
      tableRows: block.kind === 'RULE_TABLE' ? block.rows : null,
    });
    if (block.kind === 'THAI_EXAMPLES') {
      await session.insert(conceptBlockExamples).values(
        [...block.examples].sort(byPosition).map((example) => ({
          id: randomUUID(),
          blockId,
          position: example.position,
          sentenceVersionId: example.sentenceVersionId,
          noteKo: example.noteKo,
        })),
      );
    }
  }
};

const appendAudit = (
  session: ConceptSession,
  context: ConceptCommandContext,
  action: string,
  targetType: 'CONCEPT' | 'CONCEPT_VERSION',
  targetId: string,
  summary: Record<string, unknown>,
) =>
  session.insert(auditLogs).values({
    actorSub: context.actorSub,
    actorUserId: context.actorUserId,
    action,
    target: `${targetType}:${targetId}`,
    targetType,
    targetId,
    summary,
    requestId: context.requestId,
    createdAt: context.occurredAt,
  });

const toDraftRecord = (
  candidate: ConceptValidationCandidate,
  version: number,
): ConceptDraftRecord => ({ ...candidate, version });

/** Drizzle 기반 관리자 개념 repository */
export class DrizzleConceptAdminRepository implements ConceptAdminRepository {
  constructor(private readonly database: ConceptDatabase) {}

  /** 논리 개념과 첫 초안을 한 transaction에 생성한다 */
  async createConcept(
    input: CreateConceptCommand,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord> {
    return this.database.transaction(async (transaction) => {
      const conceptId = randomUUID();
      const versionId = randomUUID();
      await transaction.insert(concepts).values({ id: conceptId });
      await transaction.insert(conceptVersions).values({
        id: versionId,
        conceptId,
        version: 1,
        revision: 0,
        category: input.category,
        position: input.position,
        title: input.title,
        summary: input.summary,
      });
      await insertBlocks(transaction, versionId, input.blocks);
      await appendAudit(transaction, context, 'CONCEPT_CREATED', 'CONCEPT', conceptId, { versionId });
      const candidate = await loadCandidate(transaction, versionId);
      if (!candidate) throw new ConceptPersistenceError('CONCEPT_PERSISTENCE_CONFLICT');
      return toDraftRecord(candidate, 1);
    });
  }

  /** 최신 버전을 복제해 다음 초안을 만든다 */
  async createNextDraft(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord> {
    return this.database.transaction(async (transaction) => {
      const [concept] = await transaction.select({ id: concepts.id })
        .from(concepts).where(eq(concepts.id, conceptId)).for('update').limit(1);
      if (!concept) throw new ConceptPersistenceError('CONCEPT_NOT_FOUND');
      const versions = await transaction.select({
        id: conceptVersions.id,
        version: conceptVersions.version,
        status: conceptVersions.status,
      }).from(conceptVersions).where(eq(conceptVersions.conceptId, conceptId))
        .orderBy(desc(conceptVersions.version)).for('update');
      if (versions.some(({ status }) => status === 'DRAFT')) {
        throw new ConceptPersistenceError('CONCEPT_DRAFT_ALREADY_EXISTS');
      }
      const source = versions[0];
      if (!source) throw new ConceptPersistenceError('CONCEPT_VERSION_NOT_FOUND');
      const sourceCandidate = await loadCandidate(transaction, source.id);
      if (!sourceCandidate) throw new ConceptPersistenceError('CONCEPT_VERSION_NOT_FOUND');
      const versionId = randomUUID();
      const nextVersion = source.version + 1;
      await transaction.insert(conceptVersions).values({
        id: versionId,
        conceptId,
        version: nextVersion,
        revision: 0,
        category: sourceCandidate.category,
        position: sourceCandidate.position,
        title: sourceCandidate.title,
        summary: sourceCandidate.summary,
      });
      await insertBlocks(transaction, versionId, sourceCandidate.blocks);
      await appendAudit(transaction, context, 'CONCEPT_VERSION_CREATED', 'CONCEPT_VERSION', versionId, { conceptId, sourceVersionId: source.id });
      const candidate = await loadCandidate(transaction, versionId);
      if (!candidate) throw new ConceptPersistenceError('CONCEPT_PERSISTENCE_CONFLICT');
      return toDraftRecord(candidate, nextVersion);
    });
  }

  /** revision이 일치하는 초안 전체를 교체한다 */
  async replaceDraft(
    versionId: string,
    input: ReplaceConceptDraftCommand,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction.update(conceptVersions).set({
        revision: input.revision + 1,
        category: input.category,
        position: input.position,
        title: input.title,
        summary: input.summary,
        validationStatus: 'PENDING',
        validationIssues: [],
        validatedRevision: null,
        validatedAt: null,
        updatedAt: context.occurredAt,
      }).where(and(
        eq(conceptVersions.id, versionId),
        eq(conceptVersions.status, 'DRAFT'),
        eq(conceptVersions.revision, input.revision),
      )).returning({ version: conceptVersions.version });
      const stored = rows[0];
      if (!stored) {
        const [current] = await transaction
          .select({
            status: conceptVersions.status,
            revision: conceptVersions.revision,
          })
          .from(conceptVersions)
          .where(eq(conceptVersions.id, versionId))
          .limit(1);
        if (!current) {
          throw new ConceptPersistenceError('CONCEPT_VERSION_NOT_FOUND');
        }
        if (current.status !== 'DRAFT') {
          throw new ConceptPersistenceError('CONCEPT_VERSION_IMMUTABLE');
        }
        throw new ConceptPersistenceError('CONCEPT_REVISION_CONFLICT');
      }
      const blockIds = await transaction.select({ id: conceptBlocks.id })
        .from(conceptBlocks).where(eq(conceptBlocks.conceptVersionId, versionId));
      if (blockIds.length > 0) {
        await transaction.delete(conceptBlockExamples).where(
          inArray(conceptBlockExamples.blockId, blockIds.map(({ id }) => id)),
        );
      }
      await transaction.delete(conceptBlocks).where(eq(conceptBlocks.conceptVersionId, versionId));
      await insertBlocks(transaction, versionId, input.blocks);
      await appendAudit(transaction, context, 'CONCEPT_VERSION_REPLACED', 'CONCEPT_VERSION', versionId, { revision: input.revision + 1 });
      const candidate = await loadCandidate(transaction, versionId);
      if (!candidate) throw new ConceptPersistenceError('CONCEPT_PERSISTENCE_CONFLICT');
      return toDraftRecord(candidate, stored.version);
    });
  }

  /** 검증용 최신 초안 snapshot을 읽는다 */
  loadValidationCandidate(versionId: string) {
    return loadCandidate(this.database, versionId);
  }

  /** 같은 revision에 검증 결과를 저장한다 */
  async saveValidation(
    input: {
      versionId: string;
      expectedRevision: number;
      issues: ConceptValidationIssue[];
      validatedAt: Date;
    },
    context: ConceptCommandContext,
  ): Promise<ConceptValidationReport> {
    return this.database.transaction(async (transaction) => {
      const status: 'PASSED' | 'FAILED' =
        input.issues.length === 0 ? 'PASSED' : 'FAILED';
      const rows = await transaction.update(conceptVersions).set({
        validationStatus: status,
        validationIssues: input.issues,
        validatedRevision: input.expectedRevision,
        validatedAt: input.validatedAt,
        updatedAt: input.validatedAt,
      }).where(and(
        eq(conceptVersions.id, input.versionId),
        eq(conceptVersions.status, 'DRAFT'),
        eq(conceptVersions.revision, input.expectedRevision),
      )).returning({ id: conceptVersions.id });
      if (rows.length !== 1) throw new ConceptPersistenceError('CONCEPT_REVISION_CONFLICT');
      await appendAudit(transaction, context, 'CONCEPT_VERSION_VALIDATED', 'CONCEPT_VERSION', input.versionId, { status, issueCount: input.issues.length });
      return { versionId: input.versionId, revision: input.expectedRevision, status, issues: input.issues, validatedAt: input.validatedAt };
    });
  }

  /** 검증된 같은 revision의 초안을 게시한다 */
  async publish(
    input: { versionId: string; expectedRevision: number },
    context: ConceptCommandContext,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [versionIdentity] = await transaction.select({
        conceptId: conceptVersions.conceptId,
      }).from(conceptVersions).where(eq(conceptVersions.id, input.versionId))
        .limit(1);
      if (!versionIdentity) throw new ConceptPersistenceError('CONCEPT_VERSION_NOT_FOUND');
      // 모든 상태 전이는 logical record를 먼저 잠가 lock order를 고정한다.
      const [concept] = await transaction.select({
        currentPublishedVersionId: concepts.currentPublishedVersionId,
      }).from(concepts).where(eq(concepts.id, versionIdentity.conceptId))
        .for('update').limit(1);
      if (!concept) throw new ConceptPersistenceError('CONCEPT_NOT_FOUND');
      const [version] = await transaction.select({
        id: conceptVersions.id,
        conceptId: conceptVersions.conceptId,
      }).from(conceptVersions).where(and(
        eq(conceptVersions.id, input.versionId),
        eq(conceptVersions.status, 'DRAFT'),
        eq(conceptVersions.validationStatus, 'PASSED'),
        eq(conceptVersions.revision, input.expectedRevision),
        eq(conceptVersions.validatedRevision, input.expectedRevision),
      )).for('update').limit(1);
      if (!version) throw new ConceptPersistenceError('CONCEPT_VALIDATION_REQUIRED');
      if (concept.currentPublishedVersionId) {
        const retired = await transaction.update(conceptVersions).set({ status: 'RETIRED' })
          .where(and(eq(conceptVersions.id, concept.currentPublishedVersionId), eq(conceptVersions.status, 'PUBLISHED')))
          .returning({ id: conceptVersions.id });
        if (retired.length !== 1) throw new ConceptPersistenceError('CONCEPT_PERSISTENCE_CONFLICT');
      }
      const published = await transaction.update(conceptVersions).set({
        status: 'PUBLISHED',
        publishedAt: context.occurredAt,
        updatedAt: context.occurredAt,
      }).where(and(eq(conceptVersions.id, input.versionId), eq(conceptVersions.status, 'DRAFT')))
        .returning({ id: conceptVersions.id });
      if (published.length !== 1) throw new ConceptPersistenceError('CONCEPT_PERSISTENCE_CONFLICT');
      const currentRows = await transaction.update(concepts).set({
        status: 'PUBLISHED',
        currentPublishedVersionId: input.versionId,
        updatedAt: context.occurredAt,
      }).where(eq(concepts.id, version.conceptId))
        .returning({ id: concepts.id });
      if (currentRows.length !== 1) {
        throw new ConceptPersistenceError('CONCEPT_PERSISTENCE_CONFLICT');
      }
      const references = await transaction.select({
        sentenceVersionId: conceptBlockExamples.sentenceVersionId,
      }).from(conceptBlockExamples).innerJoin(
        conceptBlocks,
        eq(conceptBlockExamples.blockId, conceptBlocks.id),
      ).where(eq(conceptBlocks.conceptVersionId, input.versionId));
      if (references.length > 0) {
        await transaction.update(thaiSentenceVersions).set({ frozenAt: context.occurredAt })
          .where(and(
            inArray(thaiSentenceVersions.id, references.map(({ sentenceVersionId }) => sentenceVersionId)),
            isNull(thaiSentenceVersions.frozenAt),
          ));
      }
      await appendAudit(transaction, context, 'CONCEPT_VERSION_PUBLISHED', 'CONCEPT_VERSION', input.versionId, { conceptId: version.conceptId });
    });
  }

  /** 게시 개념을 숨긴다 */
  async hide(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const rows = await transaction.update(concepts).set({
        status: 'HIDDEN',
        updatedAt: context.occurredAt,
      }).where(and(eq(concepts.id, conceptId), eq(concepts.status, 'PUBLISHED')))
        .returning({ id: concepts.id });
      if (rows.length !== 1) {
        throw new ConceptPersistenceError('CONCEPT_INVALID_TRANSITION');
      }
      await appendAudit(transaction, context, 'CONCEPT_HIDDEN', 'CONCEPT', conceptId, {});
    });
  }

  /** 유효한 현재 게시 버전이 있는 숨김 개념을 복구한다 */
  async restore(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [concept] = await transaction.select({
        id: concepts.id,
        status: concepts.status,
        currentPublishedVersionId: concepts.currentPublishedVersionId,
      }).from(concepts).where(eq(concepts.id, conceptId)).for('update').limit(1);
      if (!concept) throw new ConceptPersistenceError('CONCEPT_NOT_FOUND');
      if (concept.status !== 'HIDDEN' || !concept.currentPublishedVersionId) {
        throw new ConceptPersistenceError('CONCEPT_INVALID_TRANSITION');
      }
      const [version] = await transaction.select({ status: conceptVersions.status })
        .from(conceptVersions)
        .where(eq(conceptVersions.id, concept.currentPublishedVersionId))
        .for('update')
        .limit(1);
      if (version?.status !== 'PUBLISHED') {
        throw new ConceptPersistenceError('CONCEPT_INVALID_TRANSITION');
      }
      const rows = await transaction.update(concepts).set({
        status: 'PUBLISHED',
        updatedAt: context.occurredAt,
      }).where(and(eq(concepts.id, conceptId), eq(concepts.status, 'HIDDEN')))
        .returning({ id: concepts.id });
      if (rows.length !== 1) {
        throw new ConceptPersistenceError('CONCEPT_PERSISTENCE_CONFLICT');
      }
      await appendAudit(transaction, context, 'CONCEPT_RESTORED', 'CONCEPT', conceptId, {});
    });
  }
}

/** canonical 콘텐츠 초안 graph·IMPORTED item·audit을 한 Drizzle transaction에 저장한다 */
import { ContentDraftError } from '@flex-thia/domain/content-import/content-draft';
import {
  type ContentDraftRepository,
  type ContentDraftTransaction,
  type ResolvedContentDraftAudit,
  type ResolvedVocabularyDraftGraph,
} from '@flex-thia/domain/content-import/content-draft.repository';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { contentImportItems } from '../schema/content-import.schema.js';
import { databaseSchema as schema } from '../schema/databaseSchema.js';
import { auditLogs } from '../schema/identity.schema.js';

import {
  vocabularies,
  vocabularyMeanings,
} from '../schema/vocabulary.schema.js';

type ContentDraftDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type ContentDraftSession = Pick<ContentDraftDatabase, 'insert' | 'select'>;

type ContentDraftPersistenceCode =
  'CONTENT_DRAFT_ITEM_CONFLICT' | 'CONTENT_DRAFT_PERSISTENCE_CONFLICT';

/** 동시 item 저장과 예상하지 못한 canonical graph 충돌을 stable code로 전달한다 */
export class ContentDraftPersistenceError extends Error {
  constructor(
    readonly code: ContentDraftPersistenceCode,
    readonly operation: string,
  ) {
    super(`${code}:${operation}`);
    this.name = 'ContentDraftPersistenceError';
  }
}

const DATA_API_SQL_STATES = ['23503', '23505', '23514'] as const;

const DATA_API_CONSTRAINTS = [
  {
    code: '23505',
    kind: 'unique',
    name: 'content_import_items_import_kind_source_index_unique',
  },
  {
    code: '23514',
    kind: 'check',
    name: 'expression_occurrences_vocabulary_kind_expression',
  },
  {
    code: '23503',
    kind: 'foreign key',
    name: 'expression_occurrences_vocabulary_kind_fk',
  },
  {
    code: '23505',
    kind: 'unique',
    name: 'vocabularies_normalized_thai_unique',
  },
] as const;

interface DatabaseErrorLike {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
  message?: unknown;
  name?: unknown;
}

interface DecodedPostgreSqlError {
  code: string | undefined;
  constraint: string | undefined;
  dataApi: boolean;
}

const decodeDataApiError = (
  error: DatabaseErrorLike,
): DecodedPostgreSqlError | null => {
  if (
    error.name !== 'DatabaseErrorException' ||
    typeof error.message !== 'string'
  ) {
    return null;
  }
  const message = error.message;
  if (!message.startsWith('ERROR: ')) {
    return { code: undefined, constraint: undefined, dataApi: true };
  }
  // 첫 ERROR header와 끝 SQLSTATE만 묶어 Detail·Hint의 사용자 값을 constraint로 신뢰하지 않는다.
  const code = DATA_API_SQL_STATES.find((sqlState) =>
    message.endsWith(`; SQLState: ${sqlState}`),
  );
  const headerEnd = message.indexOf('; ');
  const header = headerEnd === -1 ? message : message.slice(0, headerEnd);
  const constraint = DATA_API_CONSTRAINTS.find(
    (candidate) =>
      candidate.code === code &&
      header.endsWith(
        ` violates ${candidate.kind} constraint "${candidate.name}"`,
      ),
  );
  return { code, constraint: constraint?.name, dataApi: true };
};

const decodePostgreSqlError = (
  error: unknown,
): DecodedPostgreSqlError | null => {
  let current = error;
  const visited = new Set<object>();
  while (typeof current === 'object' && current !== null) {
    if (visited.has(current)) {
      return null;
    }
    visited.add(current);
    const candidate = current as DatabaseErrorLike;
    if (
      typeof candidate.code === 'string' ||
      typeof candidate.constraint === 'string'
    ) {
      return {
        code: typeof candidate.code === 'string' ? candidate.code : undefined,
        constraint:
          typeof candidate.constraint === 'string'
            ? candidate.constraint
            : undefined,
        dataApi: false,
      };
    }
    const dataApiError = decodeDataApiError(candidate);
    if (dataApiError !== null) {
      return dataApiError;
    }
    current = candidate.cause;
  }
  return null;
};

const translateSharedSaveError = (error: unknown, operation: string): void => {
  const postgresError = decodePostgreSqlError(error);
  if (
    postgresError?.code === '23505' &&
    postgresError.constraint ===
      'content_import_items_import_kind_source_index_unique'
  ) {
    throw new ContentDraftPersistenceError(
      'CONTENT_DRAFT_ITEM_CONFLICT',
      operation,
    );
  }
  if (
    postgresError?.dataApi === true ||
    (typeof postgresError?.code === 'string' &&
      postgresError.code.startsWith('23'))
  ) {
    throw new ContentDraftPersistenceError(
      'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
      operation,
    );
  }
};

const translateVocabularySaveError = (
  error: unknown,
  operation: string,
): never => {
  const postgresError = decodePostgreSqlError(error);
  if (
    postgresError?.code === '23505' &&
    postgresError.constraint === 'vocabularies_normalized_thai_unique'
  ) {
    throw new ContentDraftError('IMPORT_DUPLICATE_VOCABULARY', 'thai');
  }

  translateSharedSaveError(error, operation);
  throw error;
};

const appendAudit = async (
  transaction: ContentDraftSession,
  audit: ResolvedContentDraftAudit,
): Promise<void> => {
  await transaction.insert(auditLogs).values({
    actorSub: audit.actorSub,
    actorUserId: audit.actorUserId,
    action: audit.action,
    target: audit.targetId,
    targetType: audit.targetType,
    targetId: audit.targetId,
    summary: audit.summary,
    requestId: audit.requestId,
    createdAt: audit.occurredAt,
  });
};

const saveVocabularyDraft = async (
  transaction: ContentDraftSession,
  input: {
    graph: ResolvedVocabularyDraftGraph;
    item: Parameters<ContentDraftTransaction['saveVocabularyDraft']>[0]['item'];
    audit: ResolvedContentDraftAudit;
  },
): Promise<void> => {
  const operation = 'saveVocabularyDraft';
  try {
    await transaction.insert(vocabularies).values(input.graph.vocabulary);
    await transaction.insert(vocabularyMeanings).values(input.graph.meanings);
    await transaction.insert(contentImportItems).values(input.item);
    await appendAudit(transaction, input.audit);
  } catch (error) {
    translateVocabularySaveError(error, operation);
  }
};

const createContentDraftTransaction = (
  transaction: ContentDraftSession,
): ContentDraftTransaction => ({
  async findVocabularyByNormalizedThai(normalizedThai) {
    const rows = await transaction
      .select({ id: vocabularies.id })
      .from(vocabularies)
      .where(eq(vocabularies.normalizedThai, normalizedThai))
      .for('key share')
      .limit(2);
    if (rows.length > 1) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'findVocabularyByNormalizedThai',
      );
    }
    return rows[0]?.id ?? null;
  },
  async findSuccessfulVocabularyImportItemsByReference(importId, clientRef) {
    const rows = await transaction
      .select({
        itemId: contentImportItems.id,
        clientRef: contentImportItems.clientRef,
        targetId: contentImportItems.targetId,
        referenceMap: contentImportItems.referenceMap,
      })
      .from(contentImportItems)
      .where(
        and(
          eq(contentImportItems.importId, importId),
          eq(contentImportItems.kind, 'VOCABULARY'),
          eq(contentImportItems.status, 'IMPORTED'),
          sql`${contentImportItems.referenceMap} ? ${clientRef}`,
        ),
      )
      .orderBy(asc(contentImportItems.createdAt), asc(contentImportItems.id))
      .for('key share')
      .limit(2);
    return rows.map((row) => {
      if (row.targetId === null) {
        throw new ContentDraftPersistenceError(
          'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
          'findSuccessfulVocabularyImportItemsByReference',
        );
      }
      return {
        itemId: row.itemId,
        clientRef: row.clientRef,
        targetId: row.targetId,
        referenceMap: row.referenceMap,
      };
    });
  },
  async findVocabularyById(vocabularyId) {
    const rows = await transaction
      .select({
        id: vocabularies.id,
        kind: vocabularies.kind,
        status: vocabularies.status,
      })
      .from(vocabularies)
      .where(eq(vocabularies.id, vocabularyId))
      .for('key share')
      .limit(2);
    if (rows.length > 1) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'findVocabularyById',
      );
    }
    return rows[0] ?? null;
  },
  async findVocabularyMeaningById(meaningId) {
    const rows = await transaction
      .select({
        id: vocabularyMeanings.id,
        vocabularyId: vocabularyMeanings.vocabularyId,
      })
      .from(vocabularyMeanings)
      .where(eq(vocabularyMeanings.id, meaningId))
      .for('key share')
      .limit(2);
    if (rows.length > 1) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'findVocabularyMeaningById',
      );
    }
    return rows[0] ?? null;
  },
  async saveVocabularyDraft(input) {
    await saveVocabularyDraft(transaction, input);
  },
});

/** PostgreSQL transaction callback에 canonical draft lookup·writer를 제공한다 */
export class DrizzleContentDraftRepository implements ContentDraftRepository {
  constructor(private readonly database: ContentDraftDatabase) {}

  /** callback 예외가 graph 일부를 commit하지 못하도록 Drizzle transaction을 유지한다 */
  async runInTransaction<T>(
    work: (transaction: ContentDraftTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction((transaction) =>
      work(createContentDraftTransaction(transaction)),
    );
  }
}

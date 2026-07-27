/** canonical 콘텐츠 초안 graph·IMPORTED item·audit을 한 Drizzle transaction에 저장한다 */
import {
  ContentDraftError,
  type ContentDraftRepository,
  type ContentDraftTransaction,
  type MediaAsset,
  type ResolvedContentDraftAudit,
  type ResolvedQuestionDraftGraph,
  type ResolvedVocabularyDraftGraph,
} from '@flex-thia/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  auditLogs,
  contentImportItems,
  expressionOccurrences,
  mediaAssets,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questionTags,
  questionTopics,
  questions,
  questionTypes,
  questionTypeVersions,
  questionVersions,
  questionVersionTags,
  thaiSentences,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type ContentDraftDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type ContentDraftSession = Pick<ContentDraftDatabase, 'insert' | 'select'>;
type MediaAssetRow = typeof mediaAssets.$inferSelect;

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
    code: '23503',
    kind: 'foreign key',
    name: 'question_versions_type_version_id_question_type_versions_id_fk',
  },
  {
    code: '23503',
    kind: 'foreign key',
    name: 'thai_sentence_versions_media_asset_id_media_assets_id_fk',
  },
  {
    code: '23503',
    kind: 'foreign key',
    name: 'token_occurrences_meaning_vocabulary_fk',
  },
  {
    code: '23503',
    kind: 'foreign key',
    name: 'token_occurrences_pronunciation_vocabulary_fk',
  },
  {
    code: '23503',
    kind: 'foreign key',
    name: 'token_occurrences_vocabulary_fk',
  },
  {
    code: '23505',
    kind: 'unique',
    name: 'vocabularies_normalized_thai_unique',
  },
  {
    code: '23503',
    kind: 'foreign key',
    name: 'vocabulary_pronunciations_media_asset_id_media_assets_id_fk',
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
  if (
    postgresError?.code === '23503' &&
    postgresError.constraint ===
      'vocabulary_pronunciations_media_asset_id_media_assets_id_fk'
  ) {
    throw new ContentDraftError(
      'IMPORT_REFERENCE_NOT_FOUND',
      'pronunciations.mediaAssetId',
    );
  }
  translateSharedSaveError(error, operation);
  throw error;
};

const translateQuestionSaveError = (
  error: unknown,
  operation: string,
): never => {
  const postgresError = decodePostgreSqlError(error);
  if (postgresError?.code === '23503') {
    if (
      postgresError.constraint ===
      'thai_sentence_versions_media_asset_id_media_assets_id_fk'
    ) {
      throw new ContentDraftError(
        'IMPORT_REFERENCE_NOT_FOUND',
        'sentences.mediaAssetId',
      );
    }
    if (
      postgresError.constraint ===
      'question_versions_type_version_id_question_type_versions_id_fk'
    ) {
      throw new ContentDraftError(
        'IMPORT_QUESTION_TYPE_NOT_FOUND',
        'questionTypeSlug',
      );
    }
    if (postgresError.constraint === 'token_occurrences_vocabulary_fk') {
      throw new ContentDraftError(
        'IMPORT_REFERENCE_NOT_FOUND',
        'sentences.tokens.vocabulary',
      );
    }
    if (
      postgresError.constraint === 'token_occurrences_meaning_vocabulary_fk' ||
      postgresError.constraint ===
        'token_occurrences_pronunciation_vocabulary_fk'
    ) {
      throw new ContentDraftError(
        'IMPORT_REFERENCE_MISMATCH',
        'sentences.tokens',
      );
    }
    if (
      postgresError.constraint === 'expression_occurrences_vocabulary_kind_fk'
    ) {
      throw new ContentDraftError(
        'IMPORT_REFERENCE_MISMATCH',
        'sentences.expressions',
      );
    }
  }
  if (
    postgresError?.code === '23514' &&
    postgresError.constraint ===
      'expression_occurrences_vocabulary_kind_expression'
  ) {
    throw new ContentDraftError(
      'IMPORT_REFERENCE_MISMATCH',
      'sentences.expressions',
    );
  }
  translateSharedSaveError(error, operation);
  throw error;
};

const toMediaAsset = (row: MediaAssetRow): MediaAsset => {
  const base = {
    id: row.id,
    kind: row.kind,
    storageKey: row.storageKey,
    declaredMimeType: row.declaredMimeType,
    declaredSizeBytes: row.declaredSizeBytes,
    declaredSha256: row.declaredSha256,
  };
  if (row.status === 'READY') {
    if (
      row.mimeType === null ||
      row.sizeBytes === null ||
      row.sha256 === null ||
      row.readyAt === null
    ) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'mapReadyMedia',
      );
    }
    return {
      ...base,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      status: 'READY',
      readyAt: row.readyAt,
    };
  }
  if (row.status === 'REJECTED') {
    if (
      row.mimeType === null ||
      row.sizeBytes === null ||
      row.sha256 === null
    ) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'mapRejectedMedia',
      );
    }
    return {
      ...base,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      status: 'REJECTED',
      readyAt: null,
    };
  }
  return {
    ...base,
    mimeType: null,
    sizeBytes: null,
    sha256: null,
    status: 'UPLOADING',
    readyAt: null,
  };
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
    await transaction
      .insert(vocabularyPronunciations)
      .values(input.graph.pronunciations);
    await transaction
      .insert(vocabularyMeaningPronunciations)
      .values(input.graph.meaningPronunciations);
    await transaction.insert(contentImportItems).values(input.item);
    await appendAudit(transaction, input.audit);
  } catch (error) {
    translateVocabularySaveError(error, operation);
  }
};

const comparePosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

const saveQuestionDraft = async (
  transaction: ContentDraftSession,
  input: {
    graph: ResolvedQuestionDraftGraph;
    item: Parameters<ContentDraftTransaction['saveQuestionDraft']>[0]['item'];
    audit: ResolvedContentDraftAudit;
  },
): Promise<void> => {
  const operation = 'saveQuestionDraft';
  if (input.graph.options.filter(({ isCorrect }) => isCorrect).length !== 1) {
    throw new ContentDraftPersistenceError(
      'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
      `${operation}.correctOptionCount`,
    );
  }

  const sentenceVersions = input.graph.sentences.map(({ version }) => version);
  const tokens = input.graph.sentences.flatMap(({ tokens: sentenceTokens }) =>
    [...sentenceTokens].sort(comparePosition),
  );
  const expressions = input.graph.sentences.flatMap(
    ({ expressions: sentenceExpressions }) =>
      [...sentenceExpressions].sort(
        (left, right) =>
          left.startTokenIndex - right.startTokenIndex ||
          left.endTokenIndex - right.endTokenIndex,
      ),
  );
  const blocks = [...input.graph.blocks].sort(comparePosition);
  const blockSentences = blocks.flatMap(({ sentences }) =>
    [...sentences].sort(comparePosition),
  );
  const options = [...input.graph.options].sort(comparePosition);

  try {
    await transaction.insert(questions).values(input.graph.question);
    await transaction.insert(questionVersions).values(input.graph.version);
    if (input.graph.tagIds.length > 0) {
      await transaction.insert(questionVersionTags).values(
        input.graph.tagIds.map((tagId) => ({
          questionVersionId: input.graph.version.id,
          tagId,
        })),
      );
    }
    await transaction
      .insert(thaiSentences)
      .values(input.graph.sentences.map(({ sentence }) => sentence));
    await transaction.insert(thaiSentenceVersions).values(sentenceVersions);
    if (tokens.length > 0) {
      await transaction.insert(tokenOccurrences).values(tokens);
    }
    if (expressions.length > 0) {
      await transaction.insert(expressionOccurrences).values(expressions);
    }
    await transaction.insert(questionBlocks).values(blocks);
    if (blockSentences.length > 0) {
      await transaction.insert(questionBlockSentences).values(blockSentences);
    }
    await transaction.insert(questionOptions).values(options);
    await transaction.insert(contentImportItems).values(input.item);
    await appendAudit(transaction, input.audit);
  } catch (error) {
    translateQuestionSaveError(error, operation);
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

  async findMediaAssetById(mediaAssetId) {
    const rows = await transaction
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .for('key share')
      .limit(2);
    if (rows.length > 1) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'findMediaAssetById',
      );
    }
    return rows[0] ? toMediaAsset(rows[0]) : null;
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

  async findVocabularyPronunciationById(pronunciationId) {
    const rows = await transaction
      .select({
        id: vocabularyPronunciations.id,
        vocabularyId: vocabularyPronunciations.vocabularyId,
        mediaAssetId: vocabularyPronunciations.mediaAssetId,
      })
      .from(vocabularyPronunciations)
      .where(eq(vocabularyPronunciations.id, pronunciationId))
      .for('key share')
      .limit(2);
    if (rows.length > 1) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'findVocabularyPronunciationById',
      );
    }
    return rows[0] ?? null;
  },

  async findQuestionTypeVersion(slug, version) {
    const rows = await transaction
      .select({
        id: questionTypeVersions.id,
        slug: questionTypes.slug,
        version: questionTypeVersions.version,
        template: questionTypeVersions.template,
        optionCount: questionTypeVersions.optionCount,
      })
      .from(questionTypeVersions)
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .where(
        and(
          eq(questionTypes.slug, slug),
          eq(questionTypeVersions.version, version),
          eq(questionTypeVersions.status, 'ACTIVE'),
        ),
      )
      .for('key share')
      .limit(2);
    if (rows.length > 1) {
      throw new ContentDraftPersistenceError(
        'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        'findQuestionTypeVersion',
      );
    }
    return rows[0] ?? null;
  },

  async findActiveQuestionTopic(slug) {
    const rows = await transaction
      .select({ id: questionTopics.id, slug: questionTopics.slug })
      .from(questionTopics)
      .where(
        and(eq(questionTopics.slug, slug), eq(questionTopics.status, 'ACTIVE')),
      )
      .for('key share')
      .limit(2);
    return rows.length === 1 ? rows[0]! : null;
  },

  async findActiveQuestionTags(slugs) {
    if (slugs.length === 0) return [];
    return transaction
      .select({ id: questionTags.id, slug: questionTags.slug })
      .from(questionTags)
      .where(
        and(
          inArray(questionTags.slug, slugs),
          eq(questionTags.status, 'ACTIVE'),
        ),
      )
      .for('key share');
  },

  async saveVocabularyDraft(input) {
    await saveVocabularyDraft(transaction, input);
  },

  async saveQuestionDraft(input) {
    await saveQuestionDraft(transaction, input);
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

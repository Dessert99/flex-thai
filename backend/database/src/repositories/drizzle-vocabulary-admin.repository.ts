/** 관리자 어휘 child 잠금·전체 교체·상태 전이·audit을 Drizzle transaction으로 구현한다 */
import {
  type VocabularyAdminRepository,
  VocabularyAdminRepositoryError,
  type VocabularyAdminTransaction,
} from '@flex-thia/domain';
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  auditLogs,
  expressionOccurrences,
  mediaAssets,
  tokenOccurrences,
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type VocabularyAdminDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type VocabularyAdminSession = Pick<
  VocabularyAdminDatabase,
  'delete' | 'insert' | 'select' | 'update'
>;

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

const DUPLICATE_CONSTRAINT = 'vocabularies_normalized_thai_unique';
const USAGE_CONSTRAINTS = new Set([
  'expression_occurrences_vocabulary_kind_fk',
  'token_occurrences_meaning_vocabulary_fk',
  'token_occurrences_pronunciation_vocabulary_fk',
  'token_occurrences_vocabulary_fk',
]);

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
  const code = ['23503', '23505'].find((sqlState) =>
    message.endsWith(`; SQLState: ${sqlState}`),
  );
  const headerEnd = message.indexOf('; ');
  const header = headerEnd === -1 ? message : message.slice(0, headerEnd);
  const candidates = [DUPLICATE_CONSTRAINT, ...USAGE_CONSTRAINTS];
  const constraint = candidates.find(
    (name) =>
      header.endsWith(` constraint "${name}"`) ||
      header.includes(` violates foreign key constraint "${name}" on table "`),
  );
  return { code, constraint, dataApi: true };
};

const decodePostgreSqlError = (
  error: unknown,
): DecodedPostgreSqlError | null => {
  let current = error;
  const visited = new Set<object>();
  while (typeof current === 'object' && current !== null) {
    if (visited.has(current)) return null;
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
    const dataApi = decodeDataApiError(candidate);
    if (dataApi) return dataApi;
    current = candidate.cause;
  }
  return null;
};

/** local pg와 Data API 제약 오류를 같은 관리자 어휘 stable 오류로 변환한다 */
export const translateVocabularyAdminPersistenceError = (
  error: unknown,
  operation: string,
): never => {
  if (error instanceof VocabularyAdminRepositoryError) throw error;
  const decoded = decodePostgreSqlError(error);
  if (
    decoded?.code === '23505' &&
    decoded.constraint === DUPLICATE_CONSTRAINT
  ) {
    throw new VocabularyAdminRepositoryError('VOCABULARY_DUPLICATE', operation);
  }
  if (
    decoded?.code === '23503' &&
    decoded.constraint !== undefined &&
    USAGE_CONSTRAINTS.has(decoded.constraint)
  ) {
    throw new VocabularyAdminRepositoryError('VOCABULARY_IN_USE', operation);
  }
  if (
    decoded?.dataApi === true ||
    (decoded?.code !== undefined && decoded.code.startsWith('23'))
  ) {
    throw new VocabularyAdminRepositoryError(
      'VOCABULARY_PERSISTENCE_CONFLICT',
      operation,
    );
  }
  throw error;
};

const replaceVocabulary = async (
  transaction: VocabularyAdminSession,
  graph: Parameters<VocabularyAdminTransaction['replaceVocabulary']>[0],
): Promise<void> => {
  const updated = await transaction
    .update(vocabularies)
    .set({
      thai: graph.vocabulary.thai,
      normalizedThai: graph.vocabulary.normalizedThai,
      kind: graph.vocabulary.kind,
      updatedAt: graph.vocabulary.updatedAt,
    })
    .where(
      and(
        eq(vocabularies.id, graph.vocabulary.id),
        eq(vocabularies.status, 'DRAFT'),
      ),
    )
    .returning({ id: vocabularies.id });
  if (updated.length !== 1) {
    throw new VocabularyAdminRepositoryError(
      'VOCABULARY_PERSISTENCE_CONFLICT',
      'replaceVocabulary.update',
    );
  }

  // 기존 FK를 역순으로 제거해 참조 중 child가 조용히 사라지지 않게 한다.
  await transaction
    .delete(vocabularyMeaningPronunciations)
    .where(
      eq(vocabularyMeaningPronunciations.vocabularyId, graph.vocabulary.id),
    );
  await transaction
    .delete(vocabularyPronunciations)
    .where(eq(vocabularyPronunciations.vocabularyId, graph.vocabulary.id));
  await transaction
    .delete(vocabularyMeanings)
    .where(eq(vocabularyMeanings.vocabularyId, graph.vocabulary.id));
  await transaction.insert(vocabularyMeanings).values(graph.meanings);
  await transaction
    .insert(vocabularyPronunciations)
    .values(graph.pronunciations);
  await transaction
    .insert(vocabularyMeaningPronunciations)
    .values(graph.meaningPronunciations);
};

const createVocabularyAdminTransaction = (
  transaction: VocabularyAdminSession,
): VocabularyAdminTransaction => ({
  async lockVocabularyGraph(vocabularyId) {
    const rows = await transaction
      .select({
        id: vocabularies.id,
        thai: vocabularies.thai,
        normalizedThai: vocabularies.normalizedThai,
        kind: vocabularies.kind,
        status: vocabularies.status,
      })
      .from(vocabularies)
      .where(eq(vocabularies.id, vocabularyId))
      .for('update')
      .limit(2);
    if (rows.length > 1) {
      throw new VocabularyAdminRepositoryError(
        'VOCABULARY_PERSISTENCE_CONFLICT',
        'lockVocabularyGraph.vocabulary',
      );
    }
    const vocabulary = rows[0];
    if (!vocabulary) return null;

    const meanings = await transaction
      .select({ id: vocabularyMeanings.id })
      .from(vocabularyMeanings)
      .where(eq(vocabularyMeanings.vocabularyId, vocabularyId))
      .orderBy(asc(vocabularyMeanings.id))
      .for('update');
    const pronunciations = await transaction
      .select({
        id: vocabularyPronunciations.id,
        mediaAssetId: vocabularyPronunciations.mediaAssetId,
      })
      .from(vocabularyPronunciations)
      .where(eq(vocabularyPronunciations.vocabularyId, vocabularyId))
      .orderBy(asc(vocabularyPronunciations.id))
      .for('update');
    await transaction
      .select({
        meaningId: vocabularyMeaningPronunciations.meaningId,
        pronunciationId: vocabularyMeaningPronunciations.pronunciationId,
      })
      .from(vocabularyMeaningPronunciations)
      .where(eq(vocabularyMeaningPronunciations.vocabularyId, vocabularyId))
      .orderBy(
        asc(vocabularyMeaningPronunciations.meaningId),
        asc(vocabularyMeaningPronunciations.pronunciationId),
      )
      .for('update');
    return { vocabulary, meanings, pronunciations };
  },

  async hasQuestionUsage(input) {
    const tokenCondition = or(
      eq(tokenOccurrences.vocabularyId, input.vocabularyId),
      input.meaningIds.length > 0
        ? inArray(tokenOccurrences.meaningId, input.meaningIds)
        : undefined,
      input.pronunciationIds.length > 0
        ? inArray(tokenOccurrences.pronunciationId, input.pronunciationIds)
        : undefined,
    );
    const tokenRows = await transaction
      .select({ id: tokenOccurrences.id })
      .from(tokenOccurrences)
      .where(tokenCondition)
      .limit(1);
    if (tokenRows.length > 0) return true;
    const expressionRows = await transaction
      .select({ id: expressionOccurrences.id })
      .from(expressionOccurrences)
      .where(eq(expressionOccurrences.vocabularyId, input.vocabularyId))
      .limit(1);
    return expressionRows.length > 0;
  },

  async findDuplicateVocabularyId(normalizedThai, excludeVocabularyId) {
    const rows = await transaction
      .select({ id: vocabularies.id })
      .from(vocabularies)
      .where(
        and(
          eq(vocabularies.normalizedThai, normalizedThai),
          ne(vocabularies.id, excludeVocabularyId),
        ),
      )
      .for('key share')
      .limit(2);
    if (rows.length > 1) {
      throw new VocabularyAdminRepositoryError(
        'VOCABULARY_PERSISTENCE_CONFLICT',
        'findDuplicateVocabularyId',
      );
    }
    return rows[0]?.id ?? null;
  },

  async findMediaAssetsByIds(mediaAssetIds) {
    if (mediaAssetIds.length === 0) return [];
    return transaction
      .select({ id: mediaAssets.id, status: mediaAssets.status })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, mediaAssetIds))
      .orderBy(asc(mediaAssets.id))
      .for('key share');
  },

  async replaceVocabulary(graph) {
    await replaceVocabulary(transaction, graph);
  },

  async transitionVocabularyStatus(input) {
    const updated = await transaction
      .update(vocabularies)
      .set({
        status: input.nextStatus,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(vocabularies.id, input.vocabularyId),
          eq(vocabularies.status, input.expectedStatus),
        ),
      )
      .returning({ id: vocabularies.id });
    if (updated.length !== 1) {
      throw new VocabularyAdminRepositoryError(
        'VOCABULARY_PERSISTENCE_CONFLICT',
        'transitionVocabularyStatus',
      );
    }
  },

  async appendAuditLog(input) {
    await transaction.insert(auditLogs).values({
      actorSub: input.actorUserId,
      actorUserId: input.actorUserId,
      action: input.action,
      target: input.targetId,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      requestId: input.requestId,
      createdAt: input.occurredAt,
    });
  },
});

/** PostgreSQL transaction에서 관리자 어휘 command port를 실행한다 */
export class DrizzleVocabularyAdminRepository implements VocabularyAdminRepository {
  constructor(private readonly database: VocabularyAdminDatabase) {}

  /** callback 예외가 child·상태·audit 일부를 commit하지 못하도록 묶는다 */
  async runInTransaction<T>(
    work: (transaction: VocabularyAdminTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.database.transaction((transaction) =>
        work(createVocabularyAdminTransaction(transaction)),
      );
    } catch (error) {
      return translateVocabularyAdminPersistenceError(
        error,
        'runInTransaction',
      );
    }
  }
}

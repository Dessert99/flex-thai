/** 관리자 어휘 child 잠금·전체 교체·상태 전이·audit을 Drizzle transaction으로 구현한다 */
import {
  assertVocabularyMergePair,
  createVocabularyMergeFingerprint,
  type VocabularyAdminRepository,
  VocabularyAdminRepositoryError,
  type VocabularyAdminTransaction,
  type VocabularyMergeGraph,
  type VocabularyRelationsMergeRepository,
  type VocabularyRelationsMergeRelationWrite,
  type VocabularyRelationsMergeStoredRelation,
} from '@flex-thia/domain';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  auditLogs,
  expressionOccurrences,
  mediaAssets,
  savedVocabularies,
  tokenOccurrences,
  vocabularies,
  vocabularyPracticeQuestions,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
  wordbookItems,
} from '../schema/index.js';
import {
  vocabularyMeaningRelations,
  vocabularyMergeHistory,
} from '../schema/vocabulary.schema.js';
import * as schema from '../schema/index.js';

type VocabularyAdminDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type VocabularyAdminSession = Pick<
  VocabularyAdminDatabase,
  'delete' | 'execute' | 'insert' | 'select' | 'update'
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
const DATA_API_CONSTRAINTS = [
  {
    code: '23505',
    header: `ERROR: duplicate key value violates unique constraint "${DUPLICATE_CONSTRAINT}"`,
    name: DUPLICATE_CONSTRAINT,
  },
  {
    code: '23503',
    header:
      'ERROR: update or delete on table "vocabularies" violates foreign key constraint "expression_occurrences_vocabulary_kind_fk"',
    name: 'expression_occurrences_vocabulary_kind_fk',
  },
  {
    code: '23503',
    header:
      'ERROR: update or delete on table "vocabulary_meanings" violates foreign key constraint "token_occurrences_meaning_vocabulary_fk"',
    name: 'token_occurrences_meaning_vocabulary_fk',
  },
  {
    code: '23503',
    header:
      'ERROR: update or delete on table "vocabulary_pronunciations" violates foreign key constraint "token_occurrences_pronunciation_vocabulary_fk"',
    name: 'token_occurrences_pronunciation_vocabulary_fk',
  },
  {
    code: '23503',
    header:
      'ERROR: update or delete on table "vocabularies" violates foreign key constraint "token_occurrences_vocabulary_fk"',
    name: 'token_occurrences_vocabulary_fk',
  },
] as const;

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
  const code = /; SQLState: ([0-9A-Z]{5})$/u.exec(message)?.[1];
  const headerEnd = message.indexOf('; ');
  const header = headerEnd === -1 ? message : message.slice(0, headerEnd);
  const constraint = DATA_API_CONSTRAINTS.find(
    (candidate) => candidate.code === code && candidate.header === header,
  );
  return { code, constraint: constraint?.name, dataApi: true };
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
        ...(input.publishedAt === undefined
          ? {}
          : { publishedAt: input.publishedAt }),
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
      actorSub: input.actorSub,
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

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const loadMergeGraph = async (
  session: VocabularyAdminSession,
  vocabularyId: string,
): Promise<VocabularyMergeGraph | null> => {
  const [vocabulary] = await session
    .select({
      id: vocabularies.id,
      thai: vocabularies.thai,
      normalizedThai: vocabularies.normalizedThai,
      kind: vocabularies.kind,
      status: vocabularies.status,
      mergedIntoVocabularyId: vocabularies.mergedIntoVocabularyId,
      updatedAt: vocabularies.updatedAt,
    })
    .from(vocabularies)
    .where(eq(vocabularies.id, vocabularyId))
    .limit(1);
  if (!vocabulary) return null;

  const meanings = await session
    .select({ id: vocabularyMeanings.id })
    .from(vocabularyMeanings)
    .where(eq(vocabularyMeanings.vocabularyId, vocabularyId))
    .orderBy(asc(vocabularyMeanings.id));
  const pronunciations = await session
    .select({ id: vocabularyPronunciations.id })
    .from(vocabularyPronunciations)
    .where(eq(vocabularyPronunciations.vocabularyId, vocabularyId))
    .orderBy(asc(vocabularyPronunciations.id));
  const mappings = await session
    .select({
      meaningId: vocabularyMeaningPronunciations.meaningId,
      pronunciationId: vocabularyMeaningPronunciations.pronunciationId,
    })
    .from(vocabularyMeaningPronunciations)
    .where(eq(vocabularyMeaningPronunciations.vocabularyId, vocabularyId))
    .orderBy(
      asc(vocabularyMeaningPronunciations.meaningId),
      asc(vocabularyMeaningPronunciations.pronunciationId),
    );
  const meaningIds = meanings.map(({ id }) => id);
  const relations =
    meaningIds.length === 0
      ? []
      : await session
          .select({
            id: vocabularyMeaningRelations.id,
            sourceMeaningId: vocabularyMeaningRelations.sourceMeaningId,
            targetMeaningId: vocabularyMeaningRelations.targetMeaningId,
            type: vocabularyMeaningRelations.type,
            direction: vocabularyMeaningRelations.direction,
            status: vocabularyMeaningRelations.status,
            updatedAt: vocabularyMeaningRelations.updatedAt,
          })
          .from(vocabularyMeaningRelations)
          .where(
            or(
              inArray(vocabularyMeaningRelations.sourceMeaningId, meaningIds),
              inArray(vocabularyMeaningRelations.targetMeaningId, meaningIds),
            ),
          )
          .orderBy(asc(vocabularyMeaningRelations.id));
  const incomingMerges = await session
    .select({ id: vocabularies.id })
    .from(vocabularies)
    .where(eq(vocabularies.mergedIntoVocabularyId, vocabularyId))
    .orderBy(asc(vocabularies.id));
  const tokens = await session
    .select({ id: tokenOccurrences.id })
    .from(tokenOccurrences)
    .where(eq(tokenOccurrences.vocabularyId, vocabularyId))
    .orderBy(asc(tokenOccurrences.id));
  const expressions = await session
    .select({ id: expressionOccurrences.id })
    .from(expressionOccurrences)
    .where(eq(expressionOccurrences.vocabularyId, vocabularyId))
    .orderBy(asc(expressionOccurrences.id));
  const saved = await session
    .select({
      userId: savedVocabularies.userId,
      savedAt: savedVocabularies.savedAt,
    })
    .from(savedVocabularies)
    .where(eq(savedVocabularies.vocabularyId, vocabularyId))
    .orderBy(asc(savedVocabularies.userId));
  const wordbooks = await session
    .select({
      wordbookId: wordbookItems.wordbookId,
      addedAt: wordbookItems.addedAt,
    })
    .from(wordbookItems)
    .where(eq(wordbookItems.vocabularyId, vocabularyId))
    .orderBy(asc(wordbookItems.wordbookId));
  const practiceQuestions = await session
    .select({ id: vocabularyPracticeQuestions.id })
    .from(vocabularyPracticeQuestions)
    .where(eq(vocabularyPracticeQuestions.vocabularyId, vocabularyId))
    .orderBy(asc(vocabularyPracticeQuestions.id));

  return {
    vocabulary: {
      ...vocabulary,
      updatedAt: toIsoString(vocabulary.updatedAt),
    },
    meanings: meaningIds,
    pronunciations: pronunciations.map(({ id }) => id),
    meaningPronunciations: mappings.map(
      ({ meaningId, pronunciationId }) => `${meaningId}:${pronunciationId}`,
    ),
    relations: relations.map((relation) => ({
      ...relation,
      updatedAt: toIsoString(relation.updatedAt),
    })),
    incomingMergeSourceIds: incomingMerges.map(({ id }) => id),
    tokenOccurrenceIds: tokens.map(({ id }) => id),
    expressionOccurrenceIds: expressions.map(({ id }) => id),
    savedMemberships: saved.map(
      ({ userId, savedAt }) => `${userId}:${toIsoString(savedAt)}`,
    ),
    wordbookMemberships: wordbooks.map(
      ({ wordbookId, addedAt }) => `${wordbookId}:${toIsoString(addedAt)}`,
    ),
    practiceQuestionIds: practiceQuestions.map(({ id }) => id),
  };
};

const mergeMovedCounts = (source: VocabularyMergeGraph) => ({
  meanings: source.meanings.length,
  pronunciations: source.pronunciations.length,
  meaningPronunciations: source.meaningPronunciations.length,
  tokenOccurrences: source.tokenOccurrenceIds.length,
  expressionOccurrences: source.expressionOccurrenceIds.length,
  savedMemberships: source.savedMemberships.length,
  wordbookMemberships: source.wordbookMemberships.length,
  practiceQuestions: source.practiceQuestionIds.length,
});

/** PostgreSQL transaction에서 관리자 어휘 command port를 실행한다 */
export class DrizzleVocabularyAdminRepository
  implements VocabularyAdminRepository, VocabularyRelationsMergeRepository
{
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

  /** 두 뜻의 owner를 relation 경로 검증용으로 조회한다 */
  async findMeaningOwners(meaningIds: string[]) {
    if (meaningIds.length === 0) return [];
    return this.database
      .select({
        meaningId: vocabularyMeanings.id,
        vocabularyId: vocabularyMeanings.vocabularyId,
      })
      .from(vocabularyMeanings)
      .where(inArray(vocabularyMeanings.id, meaningIds))
      .orderBy(asc(vocabularyMeanings.id));
  }

  /** DB unique가 양방향 역중복까지 보호하는 canonical 관계를 생성한다 */
  async createRelation(
    relation: VocabularyRelationsMergeRelationWrite,
  ): Promise<VocabularyRelationsMergeStoredRelation> {
    try {
      const [stored] = await this.database
        .insert(vocabularyMeaningRelations)
        .values({
          id: relation.id,
          sourceMeaningId: relation.sourceMeaningId,
          targetMeaningId: relation.targetMeaningId,
          type: relation.type,
          direction: relation.direction,
          status: relation.status,
          createdAt: relation.createdAt,
          updatedAt: relation.updatedAt,
        })
        .returning();
      if (!stored) {
        throw new VocabularyAdminRepositoryError(
          'MEANING_RELATION_NOT_FOUND',
          'createRelation',
        );
      }
      return stored;
    } catch (error) {
      const decoded = decodePostgreSqlError(error);
      if (decoded?.code === '23505') {
        throw new VocabularyAdminRepositoryError(
          'MEANING_RELATION_DUPLICATE',
          'createRelation',
        );
      }
      throw error;
    }
  }

  /** 경로 어휘의 어느 뜻이든 연결된 관계 한 건을 조회한다 */
  async findRelation(input: {
    vocabularyId: string;
    relationId: string;
  }): Promise<VocabularyRelationsMergeStoredRelation | null> {
    const [relation] = await this.database
      .select()
      .from(vocabularyMeaningRelations)
      .where(eq(vocabularyMeaningRelations.id, input.relationId))
      .limit(1);
    if (!relation) return null;
    const owners = await this.findMeaningOwners([
      relation.sourceMeaningId,
      relation.targetMeaningId,
    ]);
    if (
      !owners.some(({ vocabularyId }) => vocabularyId === input.vocabularyId)
    ) {
      return null;
    }
    return relation;
  }

  /** 기존 관계 row만 exact update해 검토 상태 경쟁을 드러낸다 */
  async updateRelation(
    relation: VocabularyRelationsMergeRelationWrite,
  ): Promise<VocabularyRelationsMergeStoredRelation> {
    try {
      const [stored] = await this.database
        .update(vocabularyMeaningRelations)
        .set({
          sourceMeaningId: relation.sourceMeaningId,
          targetMeaningId: relation.targetMeaningId,
          type: relation.type,
          direction: relation.direction,
          status: relation.status,
          updatedAt: relation.updatedAt,
        })
        .where(eq(vocabularyMeaningRelations.id, relation.id))
        .returning();
      if (!stored) {
        throw new VocabularyAdminRepositoryError(
          'MEANING_RELATION_NOT_FOUND',
          'updateRelation',
        );
      }
      return stored;
    } catch (error) {
      const decoded = decodePostgreSqlError(error);
      if (decoded?.code === '23505') {
        throw new VocabularyAdminRepositoryError(
          'MEANING_RELATION_DUPLICATE',
          'updateRelation',
        );
      }
      throw error;
    }
  }

  /** 경로 소유권을 먼저 확인한 관계만 삭제한다 */
  async deleteRelation(input: {
    vocabularyId: string;
    relationId: string;
  }): Promise<boolean> {
    if (!(await this.findRelation(input))) return false;
    const deleted = await this.database
      .delete(vocabularyMeaningRelations)
      .where(eq(vocabularyMeaningRelations.id, input.relationId))
      .returning({ id: vocabularyMeaningRelations.id });
    return deleted.length === 1;
  }

  /** preview fingerprint에 필요한 두 live graph를 조회한다 */
  async loadMergePair(
    sourceVocabularyId: string,
    representativeVocabularyId: string,
  ) {
    const [source, representative] = await Promise.all([
      loadMergeGraph(this.database, sourceVocabularyId),
      loadMergeGraph(this.database, representativeVocabularyId),
    ]);
    return source && representative ? { source, representative } : null;
  }

  /** UUID 순 잠금과 fingerprint 재검증 뒤 live FK만 SERIALIZABLE로 이동한다 */
  async executeMerge(input: {
    sourceVocabularyId: string;
    representativeVocabularyId: string;
    expectedFingerprint: string;
    actorSub: string;
    actorUserId: string;
    requestId: string;
    occurredAt: Date;
  }) {
    try {
      return await this.database.transaction(
        async (transaction) => {
          const lockIds = [
            input.sourceVocabularyId,
            input.representativeVocabularyId,
          ].sort();
          const locked = await transaction
            .select({ id: vocabularies.id })
            .from(vocabularies)
            .where(inArray(vocabularies.id, lockIds))
            .orderBy(asc(vocabularies.id))
            .for('update');
          if (locked.length !== 2) {
            throw new VocabularyAdminRepositoryError(
              'VOCABULARY_NOT_FOUND',
              'executeMerge.lock',
            );
          }
          const source = await loadMergeGraph(
            transaction,
            input.sourceVocabularyId,
          );
          const representative = await loadMergeGraph(
            transaction,
            input.representativeVocabularyId,
          );
          if (!source || !representative) {
            throw new VocabularyAdminRepositoryError(
              'VOCABULARY_NOT_FOUND',
              'executeMerge.load',
            );
          }
          try {
            assertVocabularyMergePair(source, representative);
          } catch {
            throw new VocabularyAdminRepositoryError(
              'VOCABULARY_MERGE_CONFLICT',
              'executeMerge.validate',
            );
          }
          const fingerprint = createVocabularyMergeFingerprint(
            source,
            representative,
          );
          if (fingerprint !== input.expectedFingerprint) {
            throw new VocabularyAdminRepositoryError(
              'VOCABULARY_MERGE_CONFLICT',
              'executeMerge.fingerprint',
            );
          }

          // 통합 migration이 composite FK를 DEFERRABLE로 바꾼 뒤에만 이 원자 이동이 실행된다.
          await transaction.execute(sql`
          set constraints
            vocabulary_meaning_pronunciations_meaning_fk,
            vocabulary_meaning_pronunciations_pronunciation_fk,
            token_occurrences_meaning_vocabulary_fk,
            token_occurrences_pronunciation_vocabulary_fk,
            expression_occurrences_meaning_vocabulary_fk,
            expression_occurrences_pronunciation_vocabulary_fk,
            vocabulary_practice_questions_meaning_vocabulary_fk,
            vocabulary_practice_questions_pronunciation_vocabulary_fk
          deferred
        `);
          await transaction.execute(sql`
          update vocabulary_meaning_pronunciations
          set vocabulary_id = ${input.representativeVocabularyId}
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction.execute(sql`
          update vocabulary_meanings
          set vocabulary_id = ${input.representativeVocabularyId}
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction.execute(sql`
          update vocabulary_pronunciations
          set vocabulary_id = ${input.representativeVocabularyId}
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction.execute(sql`
          update token_occurrences
          set vocabulary_id = ${input.representativeVocabularyId}
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction.execute(sql`
          update expression_occurrences
          set vocabulary_id = ${input.representativeVocabularyId}
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction.execute(sql`
          update vocabulary_practice_questions
          set vocabulary_id = ${input.representativeVocabularyId}
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction.execute(sql`
          insert into saved_vocabularies (user_id, vocabulary_id, saved_at)
          select user_id, ${input.representativeVocabularyId}, saved_at
          from saved_vocabularies
          where vocabulary_id = ${input.sourceVocabularyId}
          on conflict (user_id, vocabulary_id) do update
          set saved_at = least(saved_vocabularies.saved_at, excluded.saved_at)
        `);
          await transaction.execute(sql`
          delete from saved_vocabularies
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction.execute(sql`
          insert into wordbook_items (wordbook_id, vocabulary_id, added_at)
          select wordbook_id, ${input.representativeVocabularyId}, added_at
          from wordbook_items
          where vocabulary_id = ${input.sourceVocabularyId}
          on conflict (wordbook_id, vocabulary_id) do update
          set added_at = least(wordbook_items.added_at, excluded.added_at)
        `);
          await transaction.execute(sql`
          delete from wordbook_items
          where vocabulary_id = ${input.sourceVocabularyId}
        `);
          await transaction
            .update(vocabularies)
            .set({
              status: 'MERGED',
              mergedIntoVocabularyId: input.representativeVocabularyId,
              updatedAt: input.occurredAt,
            })
            .where(
              and(
                eq(vocabularies.id, input.sourceVocabularyId),
                ne(vocabularies.status, 'MERGED'),
              ),
            );

          const movedCounts = mergeMovedCounts(source);
          await transaction.insert(vocabularyMergeHistory).values({
            sourceVocabularyId: input.sourceVocabularyId,
            representativeVocabularyId: input.representativeVocabularyId,
            fingerprint,
            sourceSnapshot: { ...source },
            representativeSnapshot: { ...representative },
            movedCounts,
            actorUserId: input.actorUserId,
            requestId: input.requestId,
            mergedAt: input.occurredAt,
          });
          await transaction.insert(auditLogs).values({
            actorSub: input.actorSub,
            actorUserId: input.actorUserId,
            action: 'VOCABULARY_MERGED',
            target: input.sourceVocabularyId,
            targetType: 'VOCABULARY',
            targetId: input.sourceVocabularyId,
            summary: {
              representativeVocabularyId: input.representativeVocabularyId,
              movedCounts,
            },
            requestId: input.requestId,
            createdAt: input.occurredAt,
          });
          return {
            sourceVocabularyId: input.sourceVocabularyId,
            representativeVocabularyId: input.representativeVocabularyId,
            movedCounts,
          };
        },
        { isolationLevel: 'serializable' },
      );
    } catch (error) {
      const code = decodePostgreSqlError(error)?.code;
      if (code === '40001' || code === '40P01') {
        throw new VocabularyAdminRepositoryError(
          'VOCABULARY_MERGE_CONFLICT',
          'executeMerge.concurrency',
        );
      }
      throw error;
    }
  }
}

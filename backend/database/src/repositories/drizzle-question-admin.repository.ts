/** 관리자 문제 버전 복제·전체 교체를 Drizzle transaction으로 구현한다 */
import {
  type MediaAsset,
  type QuestionAdminRepository,
  type QuestionAdminTransaction,
  type QuestionAdminVersionGraph,
  type QuestionAdminVersionSource,
} from '@flex-thia/domain';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  auditLogs,
  expressionOccurrences,
  mediaAssets,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionTypes,
  questionTypeVersions,
  questionVersions,
  thaiSentences,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type QuestionAdminDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type QuestionAdminSession = Pick<
  QuestionAdminDatabase,
  'delete' | 'insert' | 'select' | 'update'
>;
type MediaAssetRow = typeof mediaAssets.$inferSelect;

/** 관리자 문제 graph의 조건부 저장 충돌을 stable code로 전달한다 */
export class QuestionAdminPersistenceError extends Error {
  readonly code = 'QUESTION_ADMIN_PERSISTENCE_CONFLICT';

  constructor(readonly operation: string) {
    super(`QUESTION_ADMIN_PERSISTENCE_CONFLICT:${operation}`);
    this.name = 'QuestionAdminPersistenceError';
  }
}

const comparePosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

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
      throw new QuestionAdminPersistenceError('mapReadyMedia');
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
      throw new QuestionAdminPersistenceError('mapRejectedMedia');
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

const loadSourceChildren = async (
  transaction: QuestionAdminSession,
  version: Omit<QuestionAdminVersionSource, 'blocks' | 'options'>,
): Promise<QuestionAdminVersionSource> => {
  const blockRows = await transaction
    .select({
      id: questionBlocks.id,
      kind: questionBlocks.kind,
      displayMode: questionBlocks.displayMode,
      position: questionBlocks.position,
    })
    .from(questionBlocks)
    .where(eq(questionBlocks.questionVersionId, version.id))
    .orderBy(asc(questionBlocks.position));
  const blockSentenceRows = await transaction
    .select({
      blockId: questionBlockSentences.blockId,
      sentenceVersionId: questionBlockSentences.sentenceVersionId,
      position: questionBlockSentences.position,
      speaker: questionBlockSentences.speaker,
    })
    .from(questionBlockSentences)
    .innerJoin(
      questionBlocks,
      eq(questionBlockSentences.blockId, questionBlocks.id),
    )
    .where(eq(questionBlocks.questionVersionId, version.id))
    .orderBy(
      asc(questionBlocks.position),
      asc(questionBlockSentences.position),
    );
  const optionRows = await transaction
    .select({
      sentenceVersionId: questionOptions.sentenceVersionId,
      position: questionOptions.position,
      isCorrect: questionOptions.isCorrect,
      spanSentenceVersionId: questionOptions.spanSentenceVersionId,
      spanStartTokenIndex: questionOptions.spanStartTokenIndex,
      spanEndTokenIndex: questionOptions.spanEndTokenIndex,
    })
    .from(questionOptions)
    .where(eq(questionOptions.questionVersionId, version.id))
    .orderBy(asc(questionOptions.position));
  return {
    ...version,
    blocks: [...blockRows].sort(comparePosition).map((block) => ({
      kind: block.kind,
      displayMode: block.displayMode,
      position: block.position,
      sentences: blockSentenceRows
        .filter(({ blockId }) => blockId === block.id)
        .sort(comparePosition)
        .map(({ sentenceVersionId, position, speaker }) => ({
          sentenceVersionId,
          position,
          speaker,
        })),
    })),
    options: [...optionRows].sort(comparePosition),
  };
};

const insertVersionGraph = async (
  transaction: QuestionAdminSession,
  graph: QuestionAdminVersionGraph,
  includeVersion: boolean,
): Promise<void> => {
  if (includeVersion) {
    await transaction.insert(questionVersions).values(graph.version);
  }
  if (graph.sentences.length > 0) {
    await transaction
      .insert(thaiSentences)
      .values(graph.sentences.map(({ sentence }) => sentence));
    await transaction
      .insert(thaiSentenceVersions)
      .values(graph.sentences.map(({ version }) => version));
    const tokens = graph.sentences.flatMap(({ tokens: rows }) =>
      [...rows].sort(comparePosition),
    );
    const expressions = graph.sentences.flatMap(({ expressions: rows }) =>
      [...rows].sort(
        (left, right) =>
          left.startTokenIndex - right.startTokenIndex ||
          left.endTokenIndex - right.endTokenIndex,
      ),
    );
    if (tokens.length > 0) {
      await transaction.insert(tokenOccurrences).values(tokens);
    }
    if (expressions.length > 0) {
      await transaction.insert(expressionOccurrences).values(expressions);
    }
  }
  const blocks = [...graph.blocks].sort(comparePosition);
  const blockSentences = blocks.flatMap(({ sentences }) =>
    [...sentences].sort(comparePosition),
  );
  const options = [...graph.options].sort(comparePosition);
  await transaction.insert(questionBlocks).values(blocks);
  if (blockSentences.length > 0) {
    await transaction.insert(questionBlockSentences).values(blockSentences);
  }
  await transaction.insert(questionOptions).values(options);
};

const createQuestionAdminTransaction = (
  transaction: QuestionAdminSession,
): QuestionAdminTransaction => ({
  async loadQuestion(questionId) {
    const [row] = await transaction
      .select({
        id: questions.id,
        status: questions.status,
        currentPublishedVersionId: questions.currentPublishedVersionId,
      })
      .from(questions)
      .where(eq(questions.id, questionId))
      .for('update')
      .limit(1);
    return row ?? null;
  },

  async loadLatestVersion(questionId) {
    const [row] = await transaction
      .select({
        id: questionVersions.id,
        questionId: questionVersions.questionId,
        version: questionVersions.version,
        typeVersionId: questionVersions.typeVersionId,
        difficulty: questionVersions.difficulty,
        status: questionVersions.status,
        validationStatus: questionVersions.validationStatus,
        publishedAt: questionVersions.publishedAt,
      })
      .from(questionVersions)
      .where(eq(questionVersions.questionId, questionId))
      .orderBy(desc(questionVersions.version), desc(questionVersions.id))
      .for('update')
      .limit(1);
    return row ? loadSourceChildren(transaction, row) : null;
  },

  async loadVersionSource(versionId) {
    const [row] = await transaction
      .select({
        id: questionVersions.id,
        questionId: questionVersions.questionId,
        version: questionVersions.version,
        typeVersionId: questionVersions.typeVersionId,
        difficulty: questionVersions.difficulty,
        status: questionVersions.status,
        validationStatus: questionVersions.validationStatus,
        publishedAt: questionVersions.publishedAt,
      })
      .from(questionVersions)
      .where(eq(questionVersions.id, versionId))
      .for('update')
      .limit(1);
    return row ? loadSourceChildren(transaction, row) : null;
  },

  async findQuestionTypeVersion(slug, version) {
    const [row] = await transaction
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
        ),
      )
      .for('key share')
      .limit(1);
    return row ?? null;
  },

  async findMediaAssetById(mediaAssetId) {
    const [row] = await transaction
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .for('key share')
      .limit(1);
    return row ? toMediaAsset(row) : null;
  },

  async findVocabularyById(vocabularyId) {
    const [row] = await transaction
      .select({
        id: vocabularies.id,
        kind: vocabularies.kind,
        status: vocabularies.status,
      })
      .from(vocabularies)
      .where(eq(vocabularies.id, vocabularyId))
      .for('key share')
      .limit(1);
    return row ?? null;
  },

  async findVocabularyMeaningById(meaningId) {
    const [row] = await transaction
      .select({
        id: vocabularyMeanings.id,
        vocabularyId: vocabularyMeanings.vocabularyId,
      })
      .from(vocabularyMeanings)
      .where(eq(vocabularyMeanings.id, meaningId))
      .for('key share')
      .limit(1);
    return row ?? null;
  },

  async findVocabularyPronunciationById(pronunciationId) {
    const [row] = await transaction
      .select({
        id: vocabularyPronunciations.id,
        vocabularyId: vocabularyPronunciations.vocabularyId,
        mediaAssetId: vocabularyPronunciations.mediaAssetId,
      })
      .from(vocabularyPronunciations)
      .where(eq(vocabularyPronunciations.id, pronunciationId))
      .for('key share')
      .limit(1);
    return row ?? null;
  },

  async createVersion(graph) {
    await insertVersionGraph(transaction, graph, true);
  },

  async replaceVersion(graph) {
    const rows = await transaction
      .update(questionVersions)
      .set({
        typeVersionId: graph.version.typeVersionId,
        difficulty: graph.version.difficulty,
        validationStatus: 'PENDING',
        validationIssues: [],
        validatedAt: null,
        publishedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(questionVersions.id, graph.version.id),
          eq(questionVersions.status, 'DRAFT'),
        ),
      )
      .returning({ id: questionVersions.id });
    if (rows.length !== 1) {
      throw new QuestionAdminPersistenceError('replaceVersion');
    }

    const oldBlocks = await transaction
      .select({ id: questionBlocks.id })
      .from(questionBlocks)
      .where(eq(questionBlocks.questionVersionId, graph.version.id))
      .orderBy(asc(questionBlocks.position));
    if (oldBlocks.length > 0) {
      await transaction.delete(questionBlockSentences).where(
        inArray(
          questionBlockSentences.blockId,
          oldBlocks.map(({ id }) => id),
        ),
      );
    }
    await transaction
      .delete(questionBlocks)
      .where(eq(questionBlocks.questionVersionId, graph.version.id));
    await transaction
      .delete(questionOptions)
      .where(eq(questionOptions.questionVersionId, graph.version.id));
    // 문장 snapshot은 clone과 게시 버전에서 공유될 수 있어 연결 교체가 삭제 권한을 확장하지 않는다.
    await insertVersionGraph(transaction, graph, false);
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

/** PostgreSQL transaction에서 관리자 문제 복제·교체 port를 실행한다 */
export class DrizzleQuestionAdminRepository implements QuestionAdminRepository {
  constructor(private readonly database: QuestionAdminDatabase) {}

  /** callback 예외가 graph와 audit 일부를 commit하지 못하도록 transaction을 유지한다 */
  async runInTransaction<T>(
    work: (transaction: QuestionAdminTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction((transaction) =>
      work(createQuestionAdminTransaction(transaction)),
    );
  }
}

/** 문제 검증 후보 조회와 게시 상태 전이를 한 Drizzle transaction으로 구현한다 */
import {
  MediaAssetDomainError,
  type MediaAsset,
  type QuestionPublicationRepository,
  type QuestionPublicationTransaction,
  type QuestionSentenceCandidate,
  type QuestionVersionValidationCandidate,
} from '@flex-thia/domain';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { alias, type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  auditLogs,
  expressionOccurrences,
  mediaAssets,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionTypeVersions,
  questionVersions,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type QuestionPublicationDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type QuestionPublicationSession = Pick<
  QuestionPublicationDatabase,
  'insert' | 'select' | 'update'
>;

interface MediaProjection {
  mediaId: string;
  mediaKind: 'AUDIO';
  mediaStorageKey: string;
  mediaDeclaredMimeType: string;
  mediaDeclaredSizeBytes: number;
  mediaDeclaredSha256: string;
  mediaMimeType: string | null;
  mediaSizeBytes: number | null;
  mediaSha256: string | null;
  mediaStatus: 'UPLOADING' | 'READY' | 'REJECTED';
  mediaReadyAt: Date | null;
}

/** 게시 상태의 동시 변경이나 예상하지 못한 저장 결과를 안정적인 code로 전달한다 */
export class QuestionPublicationPersistenceError extends Error {
  readonly code = 'QUESTION_PUBLICATION_PERSISTENCE_CONFLICT';

  constructor(readonly operation: string) {
    super(`QUESTION_PUBLICATION_PERSISTENCE_CONFLICT:${operation}`);
    this.name = 'QuestionPublicationPersistenceError';
  }
}

const assertExactlyOne = (
  rows: Array<{ id: string }>,
  operation: string,
): void => {
  if (rows.length !== 1) {
    throw new QuestionPublicationPersistenceError(operation);
  }
};

const comparePosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

const compareExpressionPosition = (
  left: { startTokenIndex: number; endTokenIndex: number },
  right: { startTokenIndex: number; endTokenIndex: number },
): number =>
  left.startTokenIndex - right.startTokenIndex ||
  left.endTokenIndex - right.endTokenIndex;

const toMediaAsset = (row: MediaProjection): MediaAsset => {
  const base = {
    id: row.mediaId,
    kind: row.mediaKind,
    storageKey: row.mediaStorageKey,
    declaredMimeType: row.mediaDeclaredMimeType,
    declaredSizeBytes: row.mediaDeclaredSizeBytes,
    declaredSha256: row.mediaDeclaredSha256,
  };
  if (row.mediaStatus === 'READY') {
    if (
      row.mediaMimeType === null ||
      row.mediaSizeBytes === null ||
      row.mediaSha256 === null ||
      row.mediaReadyAt === null
    ) {
      throw new MediaAssetDomainError('MEDIA_ASSET_NOT_READY');
    }
    return {
      ...base,
      mimeType: row.mediaMimeType,
      sizeBytes: row.mediaSizeBytes,
      sha256: row.mediaSha256,
      status: 'READY',
      readyAt: row.mediaReadyAt,
    };
  }
  if (row.mediaStatus === 'REJECTED') {
    if (
      row.mediaMimeType === null ||
      row.mediaSizeBytes === null ||
      row.mediaSha256 === null
    ) {
      throw new MediaAssetDomainError('MEDIA_ASSET_NOT_READY');
    }
    return {
      ...base,
      mimeType: row.mediaMimeType,
      sizeBytes: row.mediaSizeBytes,
      sha256: row.mediaSha256,
      status: 'REJECTED',
      readyAt: null,
    };
  }
  return {
    ...base,
    mimeType: null,
    sizeBytes: null,
    sha256: null,
    status: row.mediaStatus,
    readyAt: null,
  };
};

const createQuestionPublicationTransaction = (
  transaction: QuestionPublicationSession,
): QuestionPublicationTransaction => {
  const pronunciationMedia = alias(mediaAssets, 'pronunciation_media_assets');

  return {
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

    async loadVersion(versionId) {
      const [row] = await transaction
        .select({
          id: questionVersions.id,
          questionId: questionVersions.questionId,
          version: questionVersions.version,
          status: questionVersions.status,
          validationStatus: questionVersions.validationStatus,
          publishedAt: questionVersions.publishedAt,
        })
        .from(questionVersions)
        .where(eq(questionVersions.id, versionId))
        .for('update')
        .limit(1);
      return row ?? null;
    },

    async loadValidationCandidate(versionId) {
      const [versionRow] = await transaction
        .select({
          id: questionVersions.id,
          questionId: questionVersions.questionId,
          difficulty: questionVersions.difficulty,
          typeVersionId: questionTypeVersions.id,
          template: questionTypeVersions.template,
          optionCount: questionTypeVersions.optionCount,
        })
        .from(questionVersions)
        .innerJoin(
          questionTypeVersions,
          eq(questionVersions.typeVersionId, questionTypeVersions.id),
        )
        .where(eq(questionVersions.id, versionId))
        .limit(1);
      if (!versionRow) {
        return null;
      }

      const blockRows = await transaction
        .select({
          id: questionBlocks.id,
          kind: questionBlocks.kind,
          displayMode: questionBlocks.displayMode,
          position: questionBlocks.position,
        })
        .from(questionBlocks)
        .where(eq(questionBlocks.questionVersionId, versionId))
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
        .where(eq(questionBlocks.questionVersionId, versionId))
        .orderBy(
          asc(questionBlocks.position),
          asc(questionBlockSentences.position),
        );
      const optionRows = await transaction
        .select({
          id: questionOptions.id,
          sentenceVersionId: questionOptions.sentenceVersionId,
          position: questionOptions.position,
          isCorrect: questionOptions.isCorrect,
        })
        .from(questionOptions)
        .where(eq(questionOptions.questionVersionId, versionId))
        .orderBy(asc(questionOptions.position));
      const sentenceVersionIds = [
        ...new Set([
          ...blockSentenceRows.map((row) => row.sentenceVersionId),
          ...optionRows.map((row) => row.sentenceVersionId),
        ]),
      ];
      const orderedBlockRows = [...blockRows].sort(comparePosition);
      const orderedOptionRows = [...optionRows].sort(comparePosition);

      if (sentenceVersionIds.length === 0) {
        return {
          id: versionRow.id,
          questionId: versionRow.questionId,
          difficulty: versionRow.difficulty,
          typeVersion: {
            id: versionRow.typeVersionId,
            template: versionRow.template,
            optionCount: versionRow.optionCount,
          },
          blocks: orderedBlockRows.map((block) => ({
            ...block,
            sentences: [],
          })),
          options: [],
        };
      }

      const sentenceRows = await transaction
        .select({
          sentenceVersionId: thaiSentenceVersions.id,
          originalText: thaiSentenceVersions.originalText,
          translationKo: thaiSentenceVersions.translationKo,
          pronunciationKo: thaiSentenceVersions.pronunciationKo,
          toneMarks: thaiSentenceVersions.toneMarks,
          sentenceMediaAssetId: thaiSentenceVersions.mediaAssetId,
          mediaId: mediaAssets.id,
          mediaKind: mediaAssets.kind,
          mediaStorageKey: mediaAssets.storageKey,
          mediaDeclaredMimeType: mediaAssets.declaredMimeType,
          mediaDeclaredSizeBytes: mediaAssets.declaredSizeBytes,
          mediaDeclaredSha256: mediaAssets.declaredSha256,
          mediaMimeType: mediaAssets.mimeType,
          mediaSizeBytes: mediaAssets.sizeBytes,
          mediaSha256: mediaAssets.sha256,
          mediaStatus: mediaAssets.status,
          mediaReadyAt: mediaAssets.readyAt,
        })
        .from(thaiSentenceVersions)
        .innerJoin(
          mediaAssets,
          eq(thaiSentenceVersions.mediaAssetId, mediaAssets.id),
        )
        .where(inArray(thaiSentenceVersions.id, sentenceVersionIds))
        .orderBy(asc(thaiSentenceVersions.id));
      const tokenRows = await transaction
        .select({
          sentenceVersionId: tokenOccurrences.sentenceVersionId,
          position: tokenOccurrences.position,
          surface: tokenOccurrences.surface,
          startOffset: tokenOccurrences.startOffset,
          endOffset: tokenOccurrences.endOffset,
          vocabularyId: tokenOccurrences.vocabularyId,
          meaningId: tokenOccurrences.meaningId,
          pronunciationId: tokenOccurrences.pronunciationId,
          contextMeaningKo: tokenOccurrences.contextMeaningKo,
          role: tokenOccurrences.role,
          vocabularyStatus: vocabularies.status,
          pronunciationMediaAssetId: vocabularyPronunciations.mediaAssetId,
          pronunciationMediaId: pronunciationMedia.id,
          pronunciationMediaKind: pronunciationMedia.kind,
          pronunciationMediaStorageKey: pronunciationMedia.storageKey,
          pronunciationMediaDeclaredMimeType:
            pronunciationMedia.declaredMimeType,
          pronunciationMediaDeclaredSizeBytes:
            pronunciationMedia.declaredSizeBytes,
          pronunciationMediaDeclaredSha256: pronunciationMedia.declaredSha256,
          pronunciationMediaMimeType: pronunciationMedia.mimeType,
          pronunciationMediaSizeBytes: pronunciationMedia.sizeBytes,
          pronunciationMediaSha256: pronunciationMedia.sha256,
          pronunciationMediaStatus: pronunciationMedia.status,
          pronunciationMediaReadyAt: pronunciationMedia.readyAt,
        })
        .from(tokenOccurrences)
        .innerJoin(
          vocabularies,
          eq(tokenOccurrences.vocabularyId, vocabularies.id),
        )
        .innerJoin(
          vocabularyPronunciations,
          and(
            eq(tokenOccurrences.pronunciationId, vocabularyPronunciations.id),
            eq(
              tokenOccurrences.vocabularyId,
              vocabularyPronunciations.vocabularyId,
            ),
          ),
        )
        .leftJoin(
          pronunciationMedia,
          eq(vocabularyPronunciations.mediaAssetId, pronunciationMedia.id),
        )
        .where(inArray(tokenOccurrences.sentenceVersionId, sentenceVersionIds))
        .orderBy(
          asc(tokenOccurrences.sentenceVersionId),
          asc(tokenOccurrences.position),
        );
      const expressionRows = await transaction
        .select({
          sentenceVersionId: expressionOccurrences.sentenceVersionId,
          startTokenIndex: expressionOccurrences.startTokenIndex,
          endTokenIndex: expressionOccurrences.endTokenIndex,
          vocabularyId: expressionOccurrences.vocabularyId,
          vocabularyKind: expressionOccurrences.vocabularyKind,
          representative: expressionOccurrences.representative,
          vocabularyStatus: vocabularies.status,
        })
        .from(expressionOccurrences)
        .innerJoin(
          vocabularies,
          and(
            eq(expressionOccurrences.vocabularyId, vocabularies.id),
            eq(expressionOccurrences.vocabularyKind, vocabularies.kind),
          ),
        )
        .where(
          inArray(expressionOccurrences.sentenceVersionId, sentenceVersionIds),
        )
        .orderBy(
          asc(expressionOccurrences.sentenceVersionId),
          asc(expressionOccurrences.startTokenIndex),
          asc(expressionOccurrences.endTokenIndex),
        );

      const sentences = new Map<string, QuestionSentenceCandidate>();
      sentenceRows.forEach((row) => {
        const sentenceTokens = tokenRows
          .filter((token) => token.sentenceVersionId === row.sentenceVersionId)
          .sort(comparePosition);
        const sentenceExpressions = expressionRows
          .filter(
            (expression) =>
              expression.sentenceVersionId === row.sentenceVersionId,
          )
          .sort(compareExpressionPosition);
        const pronunciationMediaAssets = sentenceTokens.map((token) => {
          if (token.pronunciationMediaAssetId === null) {
            return null;
          }
          if (
            token.pronunciationMediaId === null ||
            token.pronunciationMediaKind === null ||
            token.pronunciationMediaStorageKey === null ||
            token.pronunciationMediaDeclaredMimeType === null ||
            token.pronunciationMediaDeclaredSizeBytes === null ||
            token.pronunciationMediaDeclaredSha256 === null ||
            token.pronunciationMediaStatus === null
          ) {
            throw new MediaAssetDomainError('MEDIA_ASSET_NOT_READY');
          }
          return toMediaAsset({
            mediaId: token.pronunciationMediaId,
            mediaKind: token.pronunciationMediaKind,
            mediaStorageKey: token.pronunciationMediaStorageKey,
            mediaDeclaredMimeType: token.pronunciationMediaDeclaredMimeType,
            mediaDeclaredSizeBytes: token.pronunciationMediaDeclaredSizeBytes,
            mediaDeclaredSha256: token.pronunciationMediaDeclaredSha256,
            mediaMimeType: token.pronunciationMediaMimeType,
            mediaSizeBytes: token.pronunciationMediaSizeBytes,
            mediaSha256: token.pronunciationMediaSha256,
            mediaStatus: token.pronunciationMediaStatus,
            mediaReadyAt: token.pronunciationMediaReadyAt,
          });
        });
        sentences.set(row.sentenceVersionId, {
          id: row.sentenceVersionId,
          input: {
            originalText: row.originalText,
            translationKo: row.translationKo,
            pronunciationKo: row.pronunciationKo,
            toneMarks: row.toneMarks,
            mediaAssetId: row.sentenceMediaAssetId,
            tokens: sentenceTokens.map((token) => ({
              position: token.position,
              surface: token.surface,
              startOffset: token.startOffset,
              endOffset: token.endOffset,
              vocabularyId: token.vocabularyId,
              meaningId: token.meaningId,
              pronunciationId: token.pronunciationId,
              contextMeaningKo: token.contextMeaningKo,
              role: token.role,
            })),
            expressions: sentenceExpressions.map((expression) => ({
              startTokenIndex: expression.startTokenIndex,
              endTokenIndex: expression.endTokenIndex,
              vocabularyId: expression.vocabularyId,
              vocabularyKind: expression.vocabularyKind,
              adminSelected: expression.representative,
            })),
          },
          mediaAsset: toMediaAsset(row),
          referencedVocabularies: [
            ...sentenceTokens.map((token) => ({
              id: token.vocabularyId,
              status: token.vocabularyStatus,
            })),
            ...sentenceExpressions.map((expression) => ({
              id: expression.vocabularyId,
              status: expression.vocabularyStatus,
            })),
          ],
          pronunciationMediaAssets,
        });
      });

      const getSentence = (sentenceVersionId: string) => {
        const sentence = sentences.get(sentenceVersionId);
        if (!sentence) {
          throw new QuestionPublicationPersistenceError(
            'loadValidationCandidate',
          );
        }
        return sentence;
      };

      return {
        id: versionRow.id,
        questionId: versionRow.questionId,
        difficulty: versionRow.difficulty,
        typeVersion: {
          id: versionRow.typeVersionId,
          template: versionRow.template,
          optionCount: versionRow.optionCount,
        },
        blocks: orderedBlockRows.map((block) => ({
          ...block,
          sentences: blockSentenceRows
            .filter((row) => row.blockId === block.id)
            .sort(comparePosition)
            .map((row) => ({
              speaker: row.speaker,
              sentence: getSentence(row.sentenceVersionId),
            })),
        })),
        options: orderedOptionRows.map((option) => ({
          id: option.id,
          position: option.position,
          isCorrect: option.isCorrect,
          sentence: getSentence(option.sentenceVersionId),
        })),
      } satisfies QuestionVersionValidationCandidate;
    },

    async saveValidation(versionId, report, validatedAt) {
      const rows = await transaction
        .update(questionVersions)
        .set({
          validationStatus: report.status,
          validationIssues: report.issues,
          validatedAt,
          updatedAt: validatedAt,
        })
        .where(eq(questionVersions.id, versionId))
        .returning({ id: questionVersions.id });
      assertExactlyOne(rows, 'saveValidation');
    },

    async retireVersion(versionId, questionId) {
      const rows = await transaction
        .update(questionVersions)
        .set({ status: 'RETIRED', updatedAt: new Date() })
        .where(
          and(
            eq(questionVersions.id, versionId),
            eq(questionVersions.questionId, questionId),
            eq(questionVersions.status, 'PUBLISHED'),
          ),
        )
        .returning({ id: questionVersions.id });
      assertExactlyOne(rows, 'retireVersion');
    },

    async publishVersion(versionId, publishedAt) {
      const rows = await transaction
        .update(questionVersions)
        .set({ status: 'PUBLISHED', publishedAt, updatedAt: publishedAt })
        .where(
          and(
            eq(questionVersions.id, versionId),
            eq(questionVersions.status, 'DRAFT'),
            eq(questionVersions.validationStatus, 'PASSED'),
          ),
        )
        .returning({ id: questionVersions.id });
      assertExactlyOne(rows, 'publishVersion');
    },

    async setCurrentPublishedVersion(questionId, versionId) {
      const updatedAt = new Date();
      const rows = await transaction
        .update(questions)
        .set({
          status: 'PUBLISHED',
          currentPublishedVersionId: versionId,
          updatedAt,
        })
        .where(
          and(
            eq(questions.id, questionId),
            inArray(questions.status, ['DRAFT', 'PUBLISHED']),
          ),
        )
        .returning({ id: questions.id });
      assertExactlyOne(rows, 'setCurrentPublishedVersion');
    },

    async freezeReferencedSentences(versionId, frozenAt) {
      const blockRows = await transaction
        .select({ sentenceVersionId: questionBlockSentences.sentenceVersionId })
        .from(questionBlockSentences)
        .innerJoin(
          questionBlocks,
          eq(questionBlockSentences.blockId, questionBlocks.id),
        )
        .where(eq(questionBlocks.questionVersionId, versionId))
        .orderBy(asc(questionBlockSentences.position));
      const optionRows = await transaction
        .select({ sentenceVersionId: questionOptions.sentenceVersionId })
        .from(questionOptions)
        .where(eq(questionOptions.questionVersionId, versionId))
        .orderBy(asc(questionOptions.position));
      const sentenceVersionIds = [
        ...new Set(
          [...blockRows, ...optionRows].map((row) => row.sentenceVersionId),
        ),
      ];
      if (sentenceVersionIds.length === 0) {
        return;
      }
      await transaction
        .update(thaiSentenceVersions)
        .set({ frozenAt })
        .where(
          and(
            inArray(thaiSentenceVersions.id, sentenceVersionIds),
            isNull(thaiSentenceVersions.frozenAt),
          ),
        )
        .returning({ id: thaiSentenceVersions.id });
    },

    async invalidateVersion(versionId) {
      const rows = await transaction
        .update(questionVersions)
        .set({ status: 'INVALIDATED', updatedAt: new Date() })
        .where(
          and(
            eq(questionVersions.id, versionId),
            eq(questionVersions.status, 'PUBLISHED'),
          ),
        )
        .returning({ id: questionVersions.id });
      assertExactlyOne(rows, 'invalidateVersion');
    },

    async hideQuestion(questionId) {
      const rows = await transaction
        .update(questions)
        .set({ status: 'HIDDEN', updatedAt: new Date() })
        .where(
          and(eq(questions.id, questionId), eq(questions.status, 'PUBLISHED')),
        )
        .returning({ id: questions.id });
      assertExactlyOne(rows, 'hideQuestion');
    },

    async restoreQuestion(questionId) {
      const rows = await transaction
        .update(questions)
        .set({ status: 'PUBLISHED', updatedAt: new Date() })
        .where(
          and(eq(questions.id, questionId), eq(questions.status, 'HIDDEN')),
        )
        .returning({ id: questions.id });
      assertExactlyOne(rows, 'restoreQuestion');
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
  };
};

/** PostgreSQL transaction에서 문제 검증·게시·무효화 port를 실행한다 */
export class DrizzleQuestionPublicationRepository implements QuestionPublicationRepository {
  constructor(private readonly database: QuestionPublicationDatabase) {}

  /** callback 결과와 예외를 변경하지 않고 같은 Drizzle transaction에 맡긴다 */
  async runInTransaction<T>(
    work: (transaction: QuestionPublicationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction((transaction) =>
      work(createQuestionPublicationTransaction(transaction)),
    );
  }
}

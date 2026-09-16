/** 문제 검증 후보 조회와 게시 상태 전이를 한 Drizzle transaction으로 구현한다 */
import {
  type QuestionPublicationRepository,
  type QuestionPublicationTransaction,
} from '@flex-thia/domain/questions/question-publication.repository';
import {
  type QuestionSentenceCandidate,
  type QuestionVersionValidationCandidate,
} from '@flex-thia/domain/questions/question-version';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { type PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema as schema } from '../schema/databaseSchema.js';
import { auditLogs } from '../schema/identity.schema.js';
import {
  expressionOccurrences,
  thaiSentenceVersions,
  tokenOccurrences,
} from '../schema/thai-content.schema.js';
import {
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionTypeVersions,
  questionVersions,
} from '../schema/questions.schema.js';
import {
  vocabularies,
  vocabularyPronunciations,
} from '../schema/vocabulary.schema.js';

type QuestionPublicationDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type QuestionPublicationSession = Pick<
  QuestionPublicationDatabase,
  'insert' | 'select' | 'update'
>;

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

const createQuestionPublicationTransaction = (
  transaction: QuestionPublicationSession,
): QuestionPublicationTransaction => {
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
          spanSentenceVersionId: questionOptions.spanSentenceVersionId,
          spanStartTokenIndex: questionOptions.spanStartTokenIndex,
          spanEndTokenIndex: questionOptions.spanEndTokenIndex,
        })
        .from(questionOptions)
        .where(eq(questionOptions.questionVersionId, versionId))
        .orderBy(asc(questionOptions.position));
      const sentenceVersionIds = [
        ...new Set([
          ...blockSentenceRows.map((row) => row.sentenceVersionId),
          ...optionRows
            .map((row) => row.sentenceVersionId)
            .filter((id): id is string => id !== null),
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
        })
        .from(thaiSentenceVersions)
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
          meaningId: expressionOccurrences.meaningId,
          pronunciationId: expressionOccurrences.pronunciationId,
          contextMeaningKo: expressionOccurrences.contextMeaningKo,
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
        sentences.set(row.sentenceVersionId, {
          id: row.sentenceVersionId,
          input: {
            originalText: row.originalText,
            translationKo: row.translationKo,
            pronunciationKo: row.pronunciationKo,
            toneMarks: row.toneMarks,
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
              meaningId: expression.meaningId,
              pronunciationId: expression.pronunciationId,
              contextMeaningKo: expression.contextMeaningKo,
              adminSelected: expression.representative,
            })),
          },
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
        options: orderedOptionRows.map((option) => {
          if (option.sentenceVersionId !== null) {
            return {
              id: option.id,
              position: option.position,
              isCorrect: option.isCorrect,
              sentence: getSentence(option.sentenceVersionId),
              span: null,
            };
          }
          if (
            option.spanSentenceVersionId === null ||
            option.spanStartTokenIndex === null ||
            option.spanEndTokenIndex === null
          ) {
            throw new QuestionPublicationPersistenceError(
              'loadValidationCandidate',
            );
          }
          return {
            id: option.id,
            position: option.position,
            isCorrect: option.isCorrect,
            sentence: null,
            span: {
              sentenceVersionId: option.spanSentenceVersionId,
              startTokenIndex: option.spanStartTokenIndex,
              endTokenIndex: option.spanEndTokenIndex,
            },
          };
        }),
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
        .where(
          and(
            eq(questionVersions.id, versionId),
            eq(questionVersions.status, 'DRAFT'),
          ),
        )
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
          [...blockRows, ...optionRows]
            .map((row) => row.sentenceVersionId)
            .filter((id): id is string => id !== null),
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

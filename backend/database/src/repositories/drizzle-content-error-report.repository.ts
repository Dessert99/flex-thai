/** 콘텐츠 오류 신고의 canonical target 해석과 workflow transaction을 구현한다 */
import type {
  ChangeContentErrorReportAssigneeRecord,
  ChangeContentErrorReportStatusRecord,
  ContentErrorReport,
  ContentErrorReportAssigneeResolver,
  ContentErrorReportOrigin,
  ContentErrorReportRepository,
  ContentErrorReportTargetResolver,
  CreateContentErrorReportRecord,
  ResolvedContentErrorReportTarget,
} from '@flex-thia/domain';
import { ContentErrorReportDomainError } from '@flex-thia/domain';
import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as baseSchema from '../schema/index.js';
import {
  contentErrorReportHistory,
  contentErrorReports,
} from '../schema/feedback.schema.js';
import {
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionVersions,
} from '../schema/questions.schema.js';
import { mediaAssets } from '../schema/media.schema.js';
import {
  thaiSentenceVersions,
  tokenOccurrences,
} from '../schema/thai-content.schema.js';
import { users } from '../schema/identity.schema.js';
import {
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/vocabulary.schema.js';

type FeedbackDatabase = PgDatabase<
  PgQueryResultHKT,
  typeof baseSchema & {
    contentErrorReports: typeof contentErrorReports;
    contentErrorReportHistory: typeof contentErrorReportHistory;
  }
>;

/** concept-learning이 공개 상태·block 관계·READY media를 검증해 제공할 대상 lookup */
export interface ConceptErrorReportTargetLookup {
  resolve(
    origin: Extract<ContentErrorReportOrigin, { kind: 'CONCEPT' }>,
  ): Promise<ResolvedContentErrorReportTarget | null>;
  resolveSentence(input: {
    sentenceVersionId: string;
    tokenPosition: number | null;
  }): Promise<ResolvedContentErrorReportTarget | null>;
  resolveSentenceAudio(
    sentenceVersionId: string,
  ): Promise<ResolvedContentErrorReportTarget | null>;
}

const mapReport = (
  row: typeof contentErrorReports.$inferSelect,
): ContentErrorReport => ({
  id: row.id,
  reporterUserId: row.reporterUserId,
  targetKind: row.targetKind,
  category: row.category,
  status: row.status,
  assigneeUserId: row.assigneeUserId,
  description: row.description,
  canonicalReference: row.canonicalReference,
  snapshot: row.snapshot,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const referenceKeys = [
  'kind',
  'contentId',
  'contentVersionId',
  'questionVersionId',
  'sentenceVersionId',
  'mediaAssetId',
  'locationId',
] as const;
const snapshotKeys = [
  'title',
  'primaryText',
  'secondaryText',
  'versionLabel',
  'locationLabel',
  'audioAssetId',
] as const;

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const strictResolvedTarget = (
  value: unknown,
): ResolvedContentErrorReportTarget | null => {
  if (
    !value ||
    typeof value !== 'object' ||
    !hasExactKeys(value as Record<string, unknown>, ['reference', 'snapshot'])
  ) {
    return null;
  }
  const { reference, snapshot } = value as Record<string, unknown>;
  if (
    !reference ||
    typeof reference !== 'object' ||
    !hasExactKeys(reference as Record<string, unknown>, referenceKeys) ||
    !snapshot ||
    typeof snapshot !== 'object' ||
    !hasExactKeys(snapshot as Record<string, unknown>, snapshotKeys)
  ) {
    return null;
  }
  const referenceRecord = reference as Record<string, unknown>;
  const snapshotRecord = snapshot as Record<string, unknown>;
  const kinds = ['QUESTION', 'VOCABULARY', 'SENTENCE', 'AUDIO', 'CONCEPT'];
  if (
    !kinds.includes(String(referenceRecord.kind)) ||
    typeof referenceRecord.contentId !== 'string' ||
    referenceRecord.contentId.length === 0 ||
    !referenceKeys
      .slice(2)
      .every((key) => isNullableString(referenceRecord[key])) ||
    typeof snapshotRecord.title !== 'string' ||
    snapshotRecord.title.length === 0 ||
    typeof snapshotRecord.primaryText !== 'string' ||
    snapshotRecord.primaryText.length === 0 ||
    !isNullableString(snapshotRecord.secondaryText) ||
    !isNullableString(snapshotRecord.versionLabel) ||
    typeof snapshotRecord.locationLabel !== 'string' ||
    snapshotRecord.locationLabel.length === 0 ||
    !isNullableString(snapshotRecord.audioAssetId) ||
    snapshotRecord.audioAssetId !== referenceRecord.mediaAssetId
  ) {
    return null;
  }
  return value as ResolvedContentErrorReportTarget;
};

interface QuestionContextRow {
  blockId?: string;
  kind?: string;
  blockPosition?: number;
  sentencePosition?: number;
  optionId?: string;
  optionPosition?: number;
  sentenceVersionId: string;
  originalText: string;
  translationKo: string;
  mediaAssetId: string | null;
}

/** DB 관계를 검증해 signed URL 없는 immutable target을 생성한다 */
export class DrizzleContentErrorReportRepository
  implements
    ContentErrorReportRepository,
    ContentErrorReportTargetResolver,
    ContentErrorReportAssigneeResolver
{
  constructor(
    private readonly database: FeedbackDatabase,
    private readonly conceptLookup?: ConceptErrorReportTargetLookup,
  ) {}

  /** origin 종류에 맞는 canonical target을 해석한다 */
  async resolve(
    origin: ContentErrorReportOrigin,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    switch (origin.kind) {
      case 'QUESTION':
        return this.resolveQuestion(origin);
      case 'VOCABULARY':
        return this.resolveVocabulary(origin);
      case 'SENTENCE':
        return this.resolveSentence(
          origin.sentenceVersionId,
          origin.tokenPosition,
        );
      case 'AUDIO':
        return origin.source.kind === 'VOCABULARY'
          ? this.resolveVocabularyAudio(origin.source.pronunciationId)
          : this.resolveSentenceAudio(origin.source.sentenceVersionId);
      case 'CONCEPT':
        return this.resolveConcept(origin);
    }
  }

  /** ACTIVE ADMIN만 담당자가 될 수 있다 */
  async isAssignable(userId: string): Promise<boolean> {
    const rows = await this.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.role, 'ADMIN'),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return rows.length === 1;
  }

  /** 신고와 SUBMITTED 이력을 같은 transaction에 저장한다 */
  async create(
    input: CreateContentErrorReportRecord,
  ): Promise<ContentErrorReport> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction
        .insert(contentErrorReports)
        .values({
          reporterUserId: input.reporterUserId,
          targetKind: input.target.reference.kind,
          category: input.category,
          description: input.description,
          canonicalReference: input.target.reference,
          snapshot: input.target.snapshot,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('CONTENT_ERROR_REPORT_CREATE_FAILED');
      await transaction.insert(contentErrorReportHistory).values({
        reportId: row.id,
        actorUserId: input.reporterUserId,
        action: 'SUBMITTED',
        createdAt: input.createdAt,
      });
      return mapReport(row);
    });
  }

  /** 상태와 처리 이력·audit을 원자 변경한다 */
  async changeStatus(
    input: ChangeContentErrorReportStatusRecord,
  ): Promise<ContentErrorReport | null> {
    return this.changeWorkflow(input, {
      status: input.toStatus,
      history: {
        action: 'STATUS_CHANGED',
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
      },
      auditAction: 'CONTENT_ERROR_REPORT_STATUS_CHANGED',
    });
  }

  /** 담당자와 처리 이력·audit을 원자 변경한다 */
  async changeAssignee(
    input: ChangeContentErrorReportAssigneeRecord,
  ): Promise<ContentErrorReport | null> {
    return this.changeWorkflow(input, {
      assigneeUserId: input.toAssigneeUserId,
      history: {
        action: 'ASSIGNEE_CHANGED',
        fromAssigneeUserId: input.fromAssigneeUserId,
        toAssigneeUserId: input.toAssigneeUserId,
      },
      auditAction: 'CONTENT_ERROR_REPORT_ASSIGNEE_CHANGED',
    });
  }

  private async changeWorkflow(
    input:
      | ChangeContentErrorReportStatusRecord
      | ChangeContentErrorReportAssigneeRecord,
    change: {
      status?: ContentErrorReport['status'];
      assigneeUserId?: string | null;
      history: Omit<
        typeof contentErrorReportHistory.$inferInsert,
        'reportId' | 'actorUserId' | 'createdAt'
      >;
      auditAction: string;
    },
  ): Promise<ContentErrorReport | null> {
    return this.database.transaction(async (transaction) => {
      if ('toAssigneeUserId' in input && input.toAssigneeUserId !== null) {
        const assignableUsers = await transaction
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, input.toAssigneeUserId),
              eq(users.role, 'ADMIN'),
              eq(users.status, 'ACTIVE'),
            ),
          )
          .limit(1)
          .for('update');
        if (!assignableUsers[0]) {
          throw new ContentErrorReportDomainError(
            'CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE',
          );
        }
      }

      const currentRows = await transaction
        .select({
          id: contentErrorReports.id,
          status: contentErrorReports.status,
          assigneeUserId: contentErrorReports.assigneeUserId,
          updatedAt: contentErrorReports.updatedAt,
        })
        .from(contentErrorReports)
        .where(eq(contentErrorReports.id, input.reportId))
        .limit(1)
        .for('update');
      const current = currentRows[0];
      if (
        !current ||
        current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime() ||
        ('fromStatus' in input && current.status !== input.fromStatus) ||
        ('fromAssigneeUserId' in input &&
          current.assigneeUserId !== input.fromAssigneeUserId)
      ) {
        return null;
      }

      const previousValuePredicate =
        'fromStatus' in input
          ? eq(contentErrorReports.status, input.fromStatus)
          : input.fromAssigneeUserId === null
            ? isNull(contentErrorReports.assigneeUserId)
            : eq(contentErrorReports.assigneeUserId, input.fromAssigneeUserId);
      const rows = await transaction
        .update(contentErrorReports)
        .set({
          ...(change.status ? { status: change.status } : {}),
          ...('assigneeUserId' in change
            ? { assigneeUserId: change.assigneeUserId }
            : {}),
          updatedAt: input.changedAt,
        })
        .where(
          and(
            eq(contentErrorReports.id, input.reportId),
            eq(contentErrorReports.updatedAt, input.expectedUpdatedAt),
            previousValuePredicate,
          ),
        )
        .returning();
      const row = rows[0];
      if (!row) return null;
      await transaction.insert(contentErrorReportHistory).values({
        reportId: row.id,
        actorUserId: input.actor.userId,
        ...change.history,
        createdAt: input.changedAt,
      });
      await transaction.insert(baseSchema.auditLogs).values({
        actorSub: input.actor.actorSub,
        actorUserId: input.actor.userId,
        action: change.auditAction,
        target: row.id,
        targetType: 'CONTENT_ERROR_REPORT',
        targetId: row.id,
        summary: change.history,
        requestId: input.actor.requestId,
        createdAt: input.changedAt,
      });
      return mapReport(row);
    });
  }

  private async resolveQuestion(
    origin: Extract<ContentErrorReportOrigin, { kind: 'QUESTION' }>,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const rows = await this.database
      .select({
        version: questionVersions.version,
        currentPublishedVersionId: questions.currentPublishedVersionId,
      })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(
        and(
          eq(questions.id, origin.questionId),
          eq(questionVersions.id, origin.questionVersionId),
          eq(questions.status, 'PUBLISHED'),
          eq(questionVersions.status, 'PUBLISHED'),
          eq(questions.currentPublishedVersionId, origin.questionVersionId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (origin.blockId === null && origin.sentenceVersionId === null) {
      return {
        reference: {
          kind: 'QUESTION',
          contentId: origin.questionId,
          contentVersionId: origin.questionVersionId,
          questionVersionId: origin.questionVersionId,
          sentenceVersionId: null,
          mediaAssetId: null,
          locationId: null,
        },
        snapshot: {
          title: '문제',
          primaryText: origin.questionId,
          secondaryText: null,
          versionLabel: `버전 ${row.version}`,
          locationLabel: '문제 전체',
          audioAssetId: null,
        },
      };
    }

    const blockContexts = await this.loadQuestionBlockContexts(origin);
    if (origin.blockId !== null) {
      if (blockContexts.length === 0) return null;
      return origin.sentenceVersionId === null
        ? this.buildQuestionBlockTarget(origin, row.version, blockContexts)
        : this.buildQuestionSentenceTarget(
            origin,
            row.version,
            blockContexts[0]!,
          );
    }
    if (blockContexts[0]) {
      return this.buildQuestionSentenceTarget(
        origin,
        row.version,
        blockContexts[0],
      );
    }
    const optionContexts = await this.loadQuestionOptionContexts(origin);
    const option = optionContexts[0];
    return option
      ? this.buildQuestionOptionTarget(origin, row.version, option)
      : null;
  }

  private loadQuestionBlockContexts(
    origin: Extract<ContentErrorReportOrigin, { kind: 'QUESTION' }>,
  ): Promise<QuestionContextRow[]> {
    return this.database
      .select({
        blockId: questionBlocks.id,
        kind: questionBlocks.kind,
        blockPosition: questionBlocks.position,
        sentencePosition: questionBlockSentences.position,
        sentenceVersionId: questionBlockSentences.sentenceVersionId,
        originalText: thaiSentenceVersions.originalText,
        translationKo: thaiSentenceVersions.translationKo,
        mediaAssetId: thaiSentenceVersions.mediaAssetId,
      })
      .from(questionBlocks)
      .innerJoin(
        questionBlockSentences,
        eq(questionBlockSentences.blockId, questionBlocks.id),
      )
      .innerJoin(
        thaiSentenceVersions,
        eq(thaiSentenceVersions.id, questionBlockSentences.sentenceVersionId),
      )
      .where(
        and(
          eq(questionBlocks.questionVersionId, origin.questionVersionId),
          ne(questionBlocks.kind, 'EXPLANATION'),
          origin.blockId === null
            ? undefined
            : eq(questionBlocks.id, origin.blockId),
          origin.sentenceVersionId === null
            ? undefined
            : eq(
                questionBlockSentences.sentenceVersionId,
                origin.sentenceVersionId,
              ),
        ),
      )
      .orderBy(
        asc(questionBlocks.position),
        asc(questionBlockSentences.position),
      );
  }

  private loadQuestionOptionContexts(
    origin: Extract<ContentErrorReportOrigin, { kind: 'QUESTION' }>,
  ): Promise<QuestionContextRow[]> {
    if (origin.sentenceVersionId === null) return Promise.resolve([]);
    return this.database
      .select({
        optionId: questionOptions.id,
        optionPosition: questionOptions.position,
        sentenceVersionId: thaiSentenceVersions.id,
        originalText: thaiSentenceVersions.originalText,
        translationKo: thaiSentenceVersions.translationKo,
        mediaAssetId: thaiSentenceVersions.mediaAssetId,
      })
      .from(questionOptions)
      .innerJoin(
        thaiSentenceVersions,
        or(
          eq(thaiSentenceVersions.id, questionOptions.sentenceVersionId),
          eq(thaiSentenceVersions.id, questionOptions.spanSentenceVersionId),
        ),
      )
      .where(
        and(
          eq(questionOptions.questionVersionId, origin.questionVersionId),
          or(
            eq(questionOptions.sentenceVersionId, origin.sentenceVersionId),
            eq(questionOptions.spanSentenceVersionId, origin.sentenceVersionId),
          ),
        ),
      )
      .orderBy(asc(questionOptions.position));
  }

  private buildQuestionBlockTarget(
    origin: Extract<ContentErrorReportOrigin, { kind: 'QUESTION' }>,
    version: number,
    contexts: QuestionContextRow[],
  ): ResolvedContentErrorReportTarget {
    const first = contexts[0]!;
    return {
      reference: {
        kind: 'QUESTION',
        contentId: origin.questionId,
        contentVersionId: origin.questionVersionId,
        questionVersionId: origin.questionVersionId,
        sentenceVersionId: null,
        mediaAssetId: null,
        locationId: origin.blockId,
      },
      snapshot: {
        title: contexts.map(({ originalText }) => originalText).join('\n'),
        primaryText: contexts
          .map(({ translationKo }) => translationKo)
          .join('\n'),
        secondaryText: null,
        versionLabel: `버전 ${version}`,
        locationLabel: `${first.kind} 블록 ${(first.blockPosition ?? 0) + 1}`,
        audioAssetId: null,
      },
    };
  }

  private buildQuestionSentenceTarget(
    origin: Extract<ContentErrorReportOrigin, { kind: 'QUESTION' }>,
    version: number,
    context: QuestionContextRow,
  ): ResolvedContentErrorReportTarget {
    return this.buildQuestionTarget(
      origin,
      version,
      context,
      context.blockId ?? null,
      `${context.kind} 블록 ${(context.blockPosition ?? 0) + 1} · 문장 ${(context.sentencePosition ?? 0) + 1}`,
    );
  }

  private buildQuestionOptionTarget(
    origin: Extract<ContentErrorReportOrigin, { kind: 'QUESTION' }>,
    version: number,
    context: QuestionContextRow,
  ): ResolvedContentErrorReportTarget {
    return this.buildQuestionTarget(
      origin,
      version,
      context,
      context.optionId ?? null,
      `선택지 ${(context.optionPosition ?? 0) + 1}`,
    );
  }

  private buildQuestionTarget(
    origin: Extract<ContentErrorReportOrigin, { kind: 'QUESTION' }>,
    version: number,
    context: {
      originalText: string;
      translationKo: string;
      mediaAssetId: string | null;
    },
    locationId: string | null,
    locationLabel: string,
  ): ResolvedContentErrorReportTarget {
    return {
      reference: {
        kind: 'QUESTION',
        contentId: origin.questionId,
        contentVersionId: origin.questionVersionId,
        questionVersionId: origin.questionVersionId,
        sentenceVersionId: origin.sentenceVersionId,
        mediaAssetId: context.mediaAssetId,
        locationId,
      },
      snapshot: {
        title: context.originalText,
        primaryText: context.translationKo,
        secondaryText: null,
        versionLabel: `버전 ${version}`,
        locationLabel,
        audioAssetId: context.mediaAssetId,
      },
    };
  }

  private async resolveConcept(
    origin: Extract<ContentErrorReportOrigin, { kind: 'CONCEPT' }>,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const target = strictResolvedTarget(
      await this.conceptLookup?.resolve(origin),
    );
    if (
      target?.reference.kind !== 'CONCEPT' ||
      target.reference.contentId !== origin.conceptId ||
      target.reference.contentVersionId !== origin.conceptVersionId ||
      target.reference.locationId !== origin.blockId
    ) {
      return null;
    }
    return target;
  }

  private async resolveVocabulary(
    origin: Extract<ContentErrorReportOrigin, { kind: 'VOCABULARY' }>,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const vocabRows = await this.database
      .select({ thai: vocabularies.thai })
      .from(vocabularies)
      .where(
        and(
          eq(vocabularies.id, origin.vocabularyId),
          eq(vocabularies.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    const vocabulary = vocabRows[0];
    if (!vocabulary) return null;
    const meaning = origin.meaningId
      ? (
          await this.database
            .select({ value: vocabularyMeanings.meaningKo })
            .from(vocabularyMeanings)
            .where(
              and(
                eq(vocabularyMeanings.id, origin.meaningId),
                eq(vocabularyMeanings.vocabularyId, origin.vocabularyId),
              ),
            )
            .limit(1)
        )[0]
      : null;
    if (origin.meaningId && !meaning) return null;
    const pronunciation = origin.pronunciationId
      ? (
          await this.database
            .select({
              value: vocabularyPronunciations.pronunciationKo,
              mediaAssetId: vocabularyPronunciations.mediaAssetId,
              mediaStatus: mediaAssets.status,
            })
            .from(vocabularyPronunciations)
            .leftJoin(
              mediaAssets,
              eq(mediaAssets.id, vocabularyPronunciations.mediaAssetId),
            )
            .where(
              and(
                eq(vocabularyPronunciations.id, origin.pronunciationId),
                eq(vocabularyPronunciations.vocabularyId, origin.vocabularyId),
              ),
            )
            .limit(1)
        )[0]
      : null;
    if (
      origin.pronunciationId &&
      (!pronunciation?.mediaAssetId || pronunciation.mediaStatus !== 'READY')
    )
      return null;
    if (origin.meaningId && origin.pronunciationId) {
      const links = await this.database
        .select({ vocabularyId: vocabularyMeaningPronunciations.vocabularyId })
        .from(vocabularyMeaningPronunciations)
        .where(
          and(
            eq(
              vocabularyMeaningPronunciations.vocabularyId,
              origin.vocabularyId,
            ),
            eq(vocabularyMeaningPronunciations.meaningId, origin.meaningId),
            eq(
              vocabularyMeaningPronunciations.pronunciationId,
              origin.pronunciationId,
            ),
          ),
        )
        .limit(1);
      if (!links[0]) return null;
    }
    return {
      reference: {
        kind: 'VOCABULARY',
        contentId: origin.vocabularyId,
        contentVersionId: null,
        questionVersionId: null,
        sentenceVersionId: null,
        mediaAssetId: pronunciation?.mediaAssetId ?? null,
        locationId: origin.meaningId ?? origin.pronunciationId,
      },
      snapshot: {
        title: vocabulary.thai,
        primaryText: meaning?.value ?? vocabulary.thai,
        secondaryText: pronunciation?.value ?? null,
        versionLabel: null,
        locationLabel: '어휘 상세',
        audioAssetId: pronunciation?.mediaAssetId ?? null,
      },
    };
  }

  private async resolveSentence(
    sentenceVersionId: string,
    tokenPosition: number | null,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const rows = await this.database
      .select()
      .from(thaiSentenceVersions)
      .where(
        and(
          eq(thaiSentenceVersions.id, sentenceVersionId),
          sql`${thaiSentenceVersions.frozenAt} is not null`,
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const blockExposures = await this.database
      .select({ questionId: questions.id })
      .from(questionBlockSentences)
      .innerJoin(
        questionBlocks,
        eq(questionBlocks.id, questionBlockSentences.blockId),
      )
      .innerJoin(
        questionVersions,
        eq(questionVersions.id, questionBlocks.questionVersionId),
      )
      .innerJoin(
        questions,
        and(
          eq(questions.id, questionVersions.questionId),
          eq(questions.currentPublishedVersionId, questionVersions.id),
        ),
      )
      .where(
        and(
          eq(questionBlockSentences.sentenceVersionId, sentenceVersionId),
          ne(questionBlocks.kind, 'EXPLANATION'),
          eq(questions.status, 'PUBLISHED'),
          eq(questionVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    const optionExposures = blockExposures[0]
      ? blockExposures
      : await this.database
          .select({ questionVersionId: questionVersions.id })
          .from(questionOptions)
          .innerJoin(
            questionVersions,
            eq(questionVersions.id, questionOptions.questionVersionId),
          )
          .innerJoin(
            questions,
            and(
              eq(questions.id, questionVersions.questionId),
              eq(questions.currentPublishedVersionId, questionVersions.id),
            ),
          )
          .where(
            and(
              or(
                eq(questionOptions.sentenceVersionId, sentenceVersionId),
                eq(questionOptions.spanSentenceVersionId, sentenceVersionId),
              ),
              eq(questions.status, 'PUBLISHED'),
              eq(questionVersions.status, 'PUBLISHED'),
            ),
          )
          .limit(1);
    if (!optionExposures[0]) {
      const target = strictResolvedTarget(
        await this.conceptLookup?.resolveSentence({
          sentenceVersionId,
          tokenPosition,
        }),
      );
      return target?.reference.kind === 'SENTENCE' &&
        target.reference.contentVersionId === sentenceVersionId &&
        target.reference.sentenceVersionId === sentenceVersionId
        ? target
        : null;
    }
    if (tokenPosition !== null) {
      const tokens = await this.database
        .select({ id: tokenOccurrences.id })
        .from(tokenOccurrences)
        .where(
          and(
            eq(tokenOccurrences.sentenceVersionId, sentenceVersionId),
            eq(tokenOccurrences.position, tokenPosition),
          ),
        )
        .limit(1);
      if (!tokens[0]) return null;
    }
    return {
      reference: {
        kind: 'SENTENCE',
        contentId: row.sentenceId,
        contentVersionId: row.id,
        questionVersionId: null,
        sentenceVersionId: row.id,
        mediaAssetId: row.mediaAssetId,
        locationId: null,
      },
      snapshot: {
        title: row.originalText,
        primaryText: row.translationKo,
        secondaryText: row.pronunciationKo,
        versionLabel: `버전 ${row.version}`,
        locationLabel:
          tokenPosition === null ? '문장' : `토큰 ${tokenPosition}`,
        audioAssetId: row.mediaAssetId,
      },
    };
  }

  private async resolveVocabularyAudio(
    pronunciationId: string,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const rows = await this.database
      .select({
        vocabularyId: vocabularies.id,
        thai: vocabularies.thai,
        pronunciation: vocabularyPronunciations.pronunciationKo,
        mediaAssetId: vocabularyPronunciations.mediaAssetId,
        mediaStatus: mediaAssets.status,
      })
      .from(vocabularyPronunciations)
      .innerJoin(
        vocabularies,
        eq(vocabularies.id, vocabularyPronunciations.vocabularyId),
      )
      .innerJoin(
        mediaAssets,
        eq(mediaAssets.id, vocabularyPronunciations.mediaAssetId),
      )
      .where(
        and(
          eq(vocabularyPronunciations.id, pronunciationId),
          eq(vocabularies.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row?.mediaAssetId || row.mediaStatus !== 'READY') return null;
    return {
      reference: {
        kind: 'AUDIO',
        contentId: row.mediaAssetId,
        contentVersionId: null,
        questionVersionId: null,
        sentenceVersionId: null,
        mediaAssetId: row.mediaAssetId,
        locationId: pronunciationId,
      },
      snapshot: {
        title: `${row.thai} 음성`,
        primaryText: row.pronunciation,
        secondaryText: null,
        versionLabel: null,
        locationLabel: '어휘 발음',
        audioAssetId: row.mediaAssetId,
      },
    };
  }

  private async resolveSentenceAudio(
    sentenceVersionId: string,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const sentence = await this.resolveSentence(sentenceVersionId, null);
    if (!sentence) {
      const target = strictResolvedTarget(
        await this.conceptLookup?.resolveSentenceAudio(sentenceVersionId),
      );
      return target?.reference.kind === 'AUDIO' &&
        target.reference.contentVersionId === sentenceVersionId &&
        target.reference.sentenceVersionId === sentenceVersionId &&
        target.reference.mediaAssetId !== null &&
        target.reference.contentId === target.reference.mediaAssetId
        ? target
        : null;
    }
    if (!sentence.reference.mediaAssetId) return null;
    const ready = await this.database
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, sentence.reference.mediaAssetId),
          eq(mediaAssets.status, 'READY'),
        ),
      )
      .limit(1);
    if (!ready[0]) return null;
    return {
      reference: {
        ...sentence.reference,
        kind: 'AUDIO',
        contentId: sentence.reference.mediaAssetId,
      },
      snapshot: {
        ...sentence.snapshot,
        title: `${sentence.snapshot.title} 음성`,
      },
    };
  }
}

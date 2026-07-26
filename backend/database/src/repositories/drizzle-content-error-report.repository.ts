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
import { and, eq } from 'drizzle-orm';
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
  questions,
  questionVersions,
} from '../schema/questions.schema.js';
import { thaiSentenceVersions } from '../schema/thai-content.schema.js';
import { users } from '../schema/identity.schema.js';
import {
  vocabularies,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/vocabulary.schema.js';

const feedbackSchema = {
  ...baseSchema,
  contentErrorReports,
  contentErrorReportHistory,
};
type FeedbackDatabase = PgDatabase<PgQueryResultHKT, typeof feedbackSchema>;

/** concept-learning이 제공할 공개 대상 lookup */
export interface ConceptErrorReportTargetLookup {
  resolve(
    origin: Extract<ContentErrorReportOrigin, { kind: 'CONCEPT' }>,
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
        return this.conceptLookup?.resolve(origin) ?? null;
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
      .select({ version: questionVersions.version })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(
        and(
          eq(questions.id, origin.questionId),
          eq(questionVersions.id, origin.questionVersionId),
          eq(questions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (origin.blockId) {
      const locations = await this.database
        .select({ id: questionBlocks.id })
        .from(questionBlocks)
        .where(
          and(
            eq(questionBlocks.id, origin.blockId),
            eq(questionBlocks.questionVersionId, origin.questionVersionId),
          ),
        )
        .limit(1);
      if (!locations[0]) return null;
    }
    return {
      reference: {
        kind: 'QUESTION',
        contentId: origin.questionId,
        contentVersionId: origin.questionVersionId,
        questionVersionId: origin.questionVersionId,
        sentenceVersionId: origin.sentenceVersionId,
        mediaAssetId: null,
        locationId: origin.blockId,
      },
      snapshot: {
        title: `문제 ${origin.questionId}`,
        primaryText: `문제 버전 ${row.version}`,
        secondaryText: null,
        versionLabel: `버전 ${row.version}`,
        locationLabel: origin.blockId ? '문제 블록' : '문제 상단',
        audioAssetId: null,
      },
    };
  }

  private async resolveVocabulary(
    origin: Extract<ContentErrorReportOrigin, { kind: 'VOCABULARY' }>,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const rows = await this.database
      .select({
        thai: vocabularies.thai,
        meaning: vocabularyMeanings.meaningKo,
        pronunciation: vocabularyPronunciations.pronunciationKo,
        mediaAssetId: vocabularyPronunciations.mediaAssetId,
      })
      .from(vocabularies)
      .leftJoin(
        vocabularyMeanings,
        and(
          eq(vocabularyMeanings.vocabularyId, vocabularies.id),
          origin.meaningId
            ? eq(vocabularyMeanings.id, origin.meaningId)
            : undefined,
        ),
      )
      .leftJoin(
        vocabularyPronunciations,
        and(
          eq(vocabularyPronunciations.vocabularyId, vocabularies.id),
          origin.pronunciationId
            ? eq(vocabularyPronunciations.id, origin.pronunciationId)
            : undefined,
        ),
      )
      .where(
        and(
          eq(vocabularies.id, origin.vocabularyId),
          eq(vocabularies.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      reference: {
        kind: 'VOCABULARY',
        contentId: origin.vocabularyId,
        contentVersionId: null,
        questionVersionId: null,
        sentenceVersionId: null,
        mediaAssetId: row.mediaAssetId,
        locationId: origin.meaningId ?? origin.pronunciationId,
      },
      snapshot: {
        title: row.thai,
        primaryText: row.meaning ?? row.pronunciation ?? row.thai,
        secondaryText: row.pronunciation,
        versionLabel: null,
        locationLabel: '어휘 상세',
        audioAssetId: row.mediaAssetId,
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
      .where(eq(thaiSentenceVersions.id, sentenceVersionId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
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
      })
      .from(vocabularyPronunciations)
      .innerJoin(
        vocabularies,
        eq(vocabularies.id, vocabularyPronunciations.vocabularyId),
      )
      .where(
        and(
          eq(vocabularyPronunciations.id, pronunciationId),
          eq(vocabularies.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row?.mediaAssetId) return null;
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
    if (!sentence?.reference.mediaAssetId) return null;
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

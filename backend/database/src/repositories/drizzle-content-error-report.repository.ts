/** 콘텐츠 오류 신고의 canonical target 해석과 workflow transaction을 구현한다 */
import type { ContentErrorReportOrigin } from '@flex-thia/domain/feedback/content-error-report';
import { ContentErrorReportDomainError } from '@flex-thia/domain/feedback/content-error-report';
import type {
  ChangeContentErrorReportAssigneeRecord,
  ChangeContentErrorReportStatusRecord,
  ContentErrorReport,
  ContentErrorReportAssigneeResolver,
  ContentErrorReportRepository,
  ContentErrorReportTargetResolver,
  CreateContentErrorReportRecord,
  ResolvedContentErrorReportTarget,
} from '@flex-thia/domain/feedback/content-error-report.repository';
import { and, eq, isNull } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { databaseSchema as baseSchema } from '../schema/databaseSchema.js';
import {
  contentErrorReportHistory,
  contentErrorReports,
} from '../schema/feedback.schema.js';
import { users } from '../schema/identity.schema.js';

import {
  vocabularies,
  vocabularyMeanings,
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
  'sentenceVersionId',
  'locationId',
] as const;
const snapshotKeys = [
  'title',
  'primaryText',
  'secondaryText',
  'versionLabel',
  'locationLabel',
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
  const kinds = ['VOCABULARY', 'SENTENCE', 'CONCEPT'];
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
    snapshotRecord.locationLabel.length === 0
  ) {
    return null;
  }
  return value as ResolvedContentErrorReportTarget;
};

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
      case 'VOCABULARY':
        return this.resolveVocabulary(origin);
      case 'SENTENCE':
        return this.resolveSentence(
          origin.sentenceVersionId,
          origin.tokenPosition,
        );
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
    return {
      reference: {
        kind: 'VOCABULARY',
        contentId: origin.vocabularyId,
        contentVersionId: null,
        sentenceVersionId: null,
        locationId: origin.meaningId,
      },
      snapshot: {
        title: vocabulary.thai,
        primaryText: meaning?.value ?? vocabulary.thai,
        secondaryText: null,
        versionLabel: null,
        locationLabel: '어휘 상세',
      },
    };
  }

  private async resolveSentence(
    sentenceVersionId: string,
    tokenPosition: number | null,
  ): Promise<ResolvedContentErrorReportTarget | null> {
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
}

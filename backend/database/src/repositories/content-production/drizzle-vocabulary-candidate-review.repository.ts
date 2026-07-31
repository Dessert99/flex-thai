/** AI 어휘 후보 승인·폐기와 DRAFT graph·audit을 한 PostgreSQL transaction으로 저장한다 */
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  assertVocabularyCandidateApproval,
  assertVocabularyCandidateDiscard,
  createVocabularyDraft,
  type ApproveVocabularyCandidateInput,
  type DiscardVocabularyCandidateInput,
  type VocabularyCandidateApprovalResult,
  type VocabularyCandidateDiscardResult,
  type VocabularyCandidateReviewRepository,
  VocabularyCandidateReviewError,
} from '@flex-thia/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  vocabularyProductionCandidates,
  vocabularyProductionValidations,
} from '../../schema/ai-vocabulary-production.schema.js';
import { auditLogs } from '../../schema/identity.schema.js';
import { mediaAssets } from '../../schema/media.schema.js';
import {
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../../schema/vocabulary.schema.js';
import * as schema from '../../schema/index.js';

type ReviewDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type ReviewTransaction = Parameters<
  Parameters<ReviewDatabase['transaction']>[0]
>[0];

type LockedCandidate = {
  id: string;
  thai: string;
  normalizedThai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: Array<{
    meaningKo: string;
    partOfSpeech: string;
    difficulty: number;
  }>;
  classification:
    | 'NEW_VOCABULARY'
    | 'EXACT_EXISTING_MEANING'
    | 'EXACT_NEW_MEANING'
    | 'POSSIBLE_DUPLICATE';
  resultGroup: 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';
  reviewStatus: 'PENDING' | 'APPROVED' | 'DISCARDED';
  revision: number;
  resolutionKind: 'DRAFT_CREATED' | 'EXISTING_LINKED' | null;
  resolvedVocabularyId: string | null;
};

type ReviewAudit = {
  action: string;
  targetId: string | null;
  actorUserId: string | null;
  actorSub: string;
  requestId: string;
  summary: Record<string, unknown>;
};

const lockRequest = (
  transaction: ReviewTransaction,
  requestId: string,
): Promise<unknown> =>
  transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`,
  );

const readCandidate = async (
  transaction: ReviewTransaction,
  candidateId: string,
): Promise<LockedCandidate | null> => {
  const [candidate] = await transaction
    .select({
      id: vocabularyProductionCandidates.id,
      thai: vocabularyProductionCandidates.thai,
      normalizedThai: vocabularyProductionCandidates.normalizedThai,
      kind: vocabularyProductionCandidates.kind,
      meanings: vocabularyProductionCandidates.meanings,
      classification: vocabularyProductionCandidates.classification,
      resultGroup: vocabularyProductionCandidates.resultGroup,
      reviewStatus: vocabularyProductionCandidates.reviewStatus,
      revision: vocabularyProductionCandidates.revision,
      resolutionKind: vocabularyProductionCandidates.resolutionKind,
      resolvedVocabularyId:
        vocabularyProductionCandidates.resolvedVocabularyId,
    })
    .from(vocabularyProductionCandidates)
    .where(eq(vocabularyProductionCandidates.id, candidateId))
    .for('update')
    .limit(1);
  return (candidate as LockedCandidate | undefined) ?? null;
};

const readReplay = async (
  transaction: ReviewTransaction,
  requestId: string,
): Promise<ReviewAudit | null> => {
  const [audit] = await transaction
    .select({
      action: auditLogs.action,
      targetId: auditLogs.targetId,
      actorUserId: auditLogs.actorUserId,
      actorSub: auditLogs.actorSub,
      requestId: auditLogs.requestId,
      summary: auditLogs.summary,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.targetType, 'VOCABULARY_CANDIDATE'),
        eq(auditLogs.requestId, requestId),
      ),
    )
    .limit(1);
  return audit ?? null;
};

const semanticRequest = (
  input: ApproveVocabularyCandidateInput | DiscardVocabularyCandidateInput,
) => {
  const context = {
    candidateId: input.candidateId,
    expectedRevision: input.expectedRevision,
    actorUserId: input.actorUserId,
    actorSub: input.actorSub,
  };
  if (!('action' in input)) return { ...context, action: 'DISCARD' };
  return input.action === 'CREATE_DRAFT'
    ? {
        ...context,
        action: input.action,
        draft: input.draft,
        confirmDuplicate: input.confirmDuplicate === true,
      }
    : {
        ...context,
        action: input.action,
        vocabularyId: input.vocabularyId,
      };
};

const isExactReplay = (
  replay: ReviewAudit,
  input: ApproveVocabularyCandidateInput | DiscardVocabularyCandidateInput,
  action: string,
): boolean =>
  replay.action === action &&
  replay.targetId === input.candidateId &&
  replay.actorUserId === input.actorUserId &&
  replay.actorSub === input.actorSub &&
  replay.requestId === input.requestId &&
  isDeepStrictEqual(replay.summary['request'], semanticRequest(input));

const approvalFromReplay = (
  replay: ReviewAudit,
): VocabularyCandidateApprovalResult | null => {
  const result = replay.summary['result'];
  if (
    typeof result !== 'object' ||
    result === null ||
    !('resolution' in result)
  ) {
    return null;
  }
  return result as VocabularyCandidateApprovalResult;
};

const discardFromReplay = (
  replay: ReviewAudit,
): VocabularyCandidateDiscardResult | null => {
  const result = replay.summary['result'];
  return typeof result === 'object' && result !== null
    ? (result as VocabularyCandidateDiscardResult)
    : null;
};

const appendAudit = (
  transaction: ReviewTransaction,
  input: {
    command: ApproveVocabularyCandidateInput | DiscardVocabularyCandidateInput;
    action: string;
    result:
      | VocabularyCandidateApprovalResult
      | VocabularyCandidateDiscardResult;
    versionId?: string | undefined;
  },
): Promise<unknown> =>
  transaction.insert(auditLogs).values({
    actorSub: input.command.actorSub,
    actorUserId: input.command.actorUserId,
    action: input.action,
    target: input.command.candidateId,
    targetType: 'VOCABULARY_CANDIDATE',
    targetId: input.command.candidateId,
    summary: {
      request: semanticRequest(input.command),
      result: input.result,
      ...(input.versionId ? { versionId: input.versionId } : {}),
    },
    requestId: input.command.requestId,
    createdAt: input.command.occurredAt,
  });

const assertCandidateSnapshot = (
  candidate: LockedCandidate,
  input: ApproveVocabularyCandidateInput & { action: 'CREATE_DRAFT' },
): boolean =>
  candidate.thai === input.draft.thai &&
  candidate.kind === input.draft.kind &&
  isDeepStrictEqual(
    candidate.meanings,
    input.draft.meanings.map(
      ({ meaningKo, partOfSpeech, difficulty }) => ({
        meaningKo,
        partOfSpeech,
        difficulty,
      }),
    ),
  );

const readRequiredValidations = async (
  transaction: ReviewTransaction,
  candidateId: string,
): Promise<boolean> => {
  const validations = await transaction
    .select({
      stage: vocabularyProductionValidations.stage,
      status: vocabularyProductionValidations.status,
    })
    .from(vocabularyProductionValidations)
    .where(eq(vocabularyProductionValidations.candidateId, candidateId));
  const passed = new Set(
    validations
      .filter(({ status }) => status === 'PASSED')
      .map(({ stage }) => stage),
  );
  return ['SCHEMA', 'DECISION_RULE', 'AI_CROSS_VALIDATION'].every((stage) =>
    passed.has(stage as never),
  );
};

const mapTransitionError = (
  error: unknown,
):
  | { kind: 'DUPLICATE_CONFIRMATION_REQUIRED' }
  | { kind: 'REVIEW_CONFLICT' }
  | null => {
  if (!(error instanceof VocabularyCandidateReviewError)) return null;
  if (
    error.code === 'VOCABULARY_CANDIDATE_DUPLICATE_CONFIRMATION_REQUIRED'
  ) {
    return { kind: 'DUPLICATE_CONFIRMATION_REQUIRED' };
  }
  if (error.code === 'VOCABULARY_CANDIDATE_REVIEW_CONFLICT') {
    return { kind: 'REVIEW_CONFLICT' };
  }
  return null;
};

const toReviewState = (candidate: LockedCandidate) => ({
  candidateId: candidate.id,
  classification: candidate.classification,
  reviewStatus: candidate.reviewStatus,
  revision: candidate.revision,
});

/** 후보 resolution과 DRAFT graph를 optimistic lock·audit replay 아래 원자 저장한다 */
export class DrizzleVocabularyCandidateReviewRepository
  implements VocabularyCandidateReviewRepository
{
  constructor(
    private readonly database: ReviewDatabase,
    private readonly now: () => Date = () => new Date(),
    private readonly generateId: () => string = randomUUID,
  ) {}

  /** 검증된 후보를 새 DRAFT graph 또는 기존 어휘 resolution으로 승인한다 */
  async approve(
    input: ApproveVocabularyCandidateInput,
  ): ReturnType<VocabularyCandidateReviewRepository['approve']> {
    return this.database.transaction(async (transaction) => {
      await lockRequest(transaction, input.requestId);
      const candidate = await readCandidate(transaction, input.candidateId);
      if (!candidate) return { kind: 'NOT_FOUND' };
      const replay = await readReplay(transaction, input.requestId);
      if (
        replay &&
        !isExactReplay(
          replay,
          input,
          'VOCABULARY_CANDIDATE_APPROVED',
        )
      ) {
        return { kind: 'IDEMPOTENCY_CONFLICT' };
      }
      if (replay) {
        const result = approvalFromReplay(replay);
        return result && candidate.reviewStatus === 'APPROVED'
          ? { kind: 'REPLAY', result }
          : { kind: 'REVIEW_CONFLICT' };
      }
      try {
        assertVocabularyCandidateApproval(toReviewState(candidate), input);
      } catch (error) {
        return mapTransitionError(error) ?? { kind: 'REVIEW_CONFLICT' };
      }

      if (input.action === 'LINK_EXISTING') {
        return this.linkExisting(transaction, candidate, input);
      }
      return this.createDraft(transaction, candidate, input);
    });
  }

  /** PENDING 후보만 terminal 폐기하고 같은 semantic request를 replay한다 */
  async discard(
    input: DiscardVocabularyCandidateInput,
  ): ReturnType<VocabularyCandidateReviewRepository['discard']> {
    return this.database.transaction(async (transaction) => {
      await lockRequest(transaction, input.requestId);
      const candidate = await readCandidate(transaction, input.candidateId);
      if (!candidate) return { kind: 'NOT_FOUND' };
      const replay = await readReplay(transaction, input.requestId);
      if (
        replay &&
        !isExactReplay(
          replay,
          input,
          'VOCABULARY_CANDIDATE_DISCARDED',
        )
      ) {
        return { kind: 'IDEMPOTENCY_CONFLICT' };
      }
      if (replay) {
        const result = discardFromReplay(replay);
        return result && candidate.reviewStatus === 'DISCARDED'
          ? { kind: 'REPLAY', result }
          : { kind: 'REVIEW_CONFLICT' };
      }
      try {
        assertVocabularyCandidateDiscard(toReviewState(candidate), input);
      } catch {
        return { kind: 'REVIEW_CONFLICT' };
      }
      const revision = candidate.revision + 1;
      const updated = await transaction
        .update(vocabularyProductionCandidates)
        .set({
          reviewStatus: 'DISCARDED',
          revision,
          reviewedBy: input.actorUserId,
          reviewedAt: input.occurredAt,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(vocabularyProductionCandidates.id, input.candidateId),
            eq(vocabularyProductionCandidates.reviewStatus, 'PENDING'),
            eq(
              vocabularyProductionCandidates.revision,
              input.expectedRevision,
            ),
          ),
        )
        .returning({ id: vocabularyProductionCandidates.id });
      if (updated.length !== 1) return { kind: 'REVIEW_CONFLICT' };
      const result: VocabularyCandidateDiscardResult = {
        candidateId: input.candidateId,
        reviewStatus: 'DISCARDED',
        revision,
      };
      await appendAudit(transaction, {
        command: input,
        action: 'VOCABULARY_CANDIDATE_DISCARDED',
        result,
      });
      return { kind: 'APPLIED', result };
    });
  }

  private async linkExisting(
    transaction: ReviewTransaction,
    candidate: LockedCandidate,
    input: ApproveVocabularyCandidateInput & { action: 'LINK_EXISTING' },
  ) {
    const [existing] = await transaction
      .select({ id: vocabularies.id })
      .from(vocabularies)
      .where(eq(vocabularies.id, input.vocabularyId))
      .limit(1);
    if (!existing) return { kind: 'EXISTING_VOCABULARY_NOT_FOUND' } as const;
    const result: VocabularyCandidateApprovalResult = {
      candidateId: input.candidateId,
      reviewStatus: 'APPROVED',
      revision: candidate.revision + 1,
      resolution: {
        kind: 'EXISTING_LINKED',
        vocabularyId: input.vocabularyId,
      },
    };
    const updated = await this.resolveCandidate(transaction, input, result);
    if (!updated) return { kind: 'REVIEW_CONFLICT' } as const;
    await appendAudit(transaction, {
      command: input,
      action: 'VOCABULARY_CANDIDATE_APPROVED',
      result,
    });
    return { kind: 'APPLIED', result } as const;
  }

  private async createDraft(
    transaction: ReviewTransaction,
    candidate: LockedCandidate,
    input: ApproveVocabularyCandidateInput & { action: 'CREATE_DRAFT' },
  ) {
    if (
      candidate.resultGroup === 'FAILED' ||
      !assertCandidateSnapshot(candidate, input) ||
      !(await readRequiredValidations(transaction, candidate.id))
    ) {
      return { kind: 'NOT_APPROVABLE' } as const;
    }
    const mediaAssetIds = [
      ...new Set(
        input.draft.pronunciations.map(({ mediaAssetId }) => mediaAssetId),
      ),
    ];
    const readyMedia = await transaction
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          inArray(mediaAssets.id, mediaAssetIds),
          eq(mediaAssets.kind, 'AUDIO'),
          eq(mediaAssets.status, 'READY'),
        ),
      );
    if (readyMedia.length !== mediaAssetIds.length) {
      return { kind: 'AUDIO_NOT_READY' } as const;
    }

    const vocabularyId = this.generateId();
    const versionId = this.generateId();
    const draft = createVocabularyDraft({
      id: vocabularyId,
      thai: input.draft.thai,
      kind: input.draft.kind,
    });
    await transaction.insert(vocabularies).values({
      ...draft,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
    const meaningIds = new Map<string, string>();
    const meanings = input.draft.meanings.map((meaning) => {
      const id = this.generateId();
      meaningIds.set(meaning.clientRef, id);
      return {
        id,
        vocabularyId,
        meaningKo: meaning.meaningKo,
        partOfSpeech: meaning.partOfSpeech,
        difficulty: meaning.difficulty,
        contextNote: meaning.contextNote,
        createdAt: input.occurredAt,
      };
    });
    const pronunciationIds = new Map<string, string>();
    const pronunciations = input.draft.pronunciations.map((pronunciation) => {
      const id = this.generateId();
      pronunciationIds.set(pronunciation.clientRef, id);
      return {
        id,
        vocabularyId,
        pronunciationKo: pronunciation.pronunciationKo,
        toneMarks: pronunciation.toneMarks,
        mediaAssetId: pronunciation.mediaAssetId,
        createdAt: input.occurredAt,
      };
    });
    await transaction.insert(vocabularyMeanings).values(meanings);
    await transaction
      .insert(vocabularyPronunciations)
      .values(pronunciations);
    await transaction.insert(vocabularyMeaningPronunciations).values(
      input.draft.meaningPronunciations.map(
        ({ meaningRef, pronunciationRef }) => ({
          vocabularyId,
          meaningId: meaningIds.get(meaningRef)!,
          pronunciationId: pronunciationIds.get(pronunciationRef)!,
        }),
      ),
    );
    const result: VocabularyCandidateApprovalResult = {
      candidateId: candidate.id,
      reviewStatus: 'APPROVED',
      revision: candidate.revision + 1,
      resolution: { kind: 'DRAFT_CREATED', vocabularyId, versionId },
    };
    const updated = await this.resolveCandidate(transaction, input, result);
    if (!updated) return { kind: 'REVIEW_CONFLICT' } as const;
    await appendAudit(transaction, {
      command: input,
      action: 'VOCABULARY_CANDIDATE_APPROVED',
      result,
      versionId,
    });
    return { kind: 'APPLIED', result } as const;
  }

  private async resolveCandidate(
    transaction: ReviewTransaction,
    input: ApproveVocabularyCandidateInput,
    result: VocabularyCandidateApprovalResult,
  ): Promise<boolean> {
    const updated = await transaction
      .update(vocabularyProductionCandidates)
      .set({
        reviewStatus: 'APPROVED',
        revision: result.revision,
        resolutionKind: result.resolution.kind,
        resolvedVocabularyId: result.resolution.vocabularyId,
        reviewedBy: input.actorUserId,
        reviewedAt: input.occurredAt,
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(vocabularyProductionCandidates.id, input.candidateId),
          eq(vocabularyProductionCandidates.reviewStatus, 'PENDING'),
          eq(
            vocabularyProductionCandidates.revision,
            input.expectedRevision,
          ),
        ),
      )
      .returning({ id: vocabularyProductionCandidates.id });
    return updated.length === 1;
  }
}

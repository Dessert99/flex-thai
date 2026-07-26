/** 뜻 관계 CRUD와 어휘 병합 preview·실행 유스케이스를 조정한다 */
import { randomUUID } from 'node:crypto';
import {
  assertMeaningRelation,
  assertMeaningRelationStatusTransition,
  assertVocabularyMergePair,
  createVocabularyMergeFingerprint,
  getNormalizedCodePointDistance,
  type MeaningRelationDirection,
  type MeaningRelationStatus,
  type MeaningRelationType,
  type VocabularyMergeGraph,
  VocabularyRelationsMergeError,
} from './vocabulary-relations-merge.js';
import {
  type VocabularyRelationsMergeRepository,
  VocabularyRelationsMergeRepositoryError,
  type VocabularyRelationsMergeStoredRelation,
  type VocabularyMergeStoredResult,
} from './vocabulary-relations-merge.repository.js';
import { VocabularyAdminRepositoryError } from './vocabulary-admin.repository.js';

export type { VocabularyMergeGraph } from './vocabulary-relations-merge.js';

/** 관계·병합 command의 인증·감사 문맥 */
export interface VocabularyRelationsMergeContext {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  occurredAt: Date;
}

/** 관계·병합 예상 실패를 HTTP가 안정적으로 분기할 code로 전달한다 */
export class VocabularyRelationsMergeAdminError extends Error {
  constructor(
    readonly code:
      | 'MEANING_RELATION_DUPLICATE'
      | 'MEANING_RELATION_NOT_FOUND'
      | 'MEANING_RELATION_SELF'
      | 'MEANING_RELATION_STATE_CONFLICT'
      | 'VOCABULARY_MERGE_CONFLICT'
      | 'VOCABULARY_MERGE_KIND_MISMATCH'
      | 'VOCABULARY_MERGE_REPRESENTATIVE_INVALID'
      | 'VOCABULARY_MERGE_SAME_TARGET'
      | 'VOCABULARY_MERGE_SOURCE_INVALID'
      | 'VOCABULARY_NOT_FOUND',
  ) {
    super(code);
    this.name = 'VocabularyRelationsMergeAdminError';
  }
}

/** 새 관계 생성 command */
export interface CreateVocabularyRelationCommand extends VocabularyRelationsMergeContext {
  vocabularyId: string;
  input: {
    sourceMeaningId: string;
    targetMeaningId: string;
    type: MeaningRelationType;
    direction: MeaningRelationDirection;
  };
}

/** 관계 수정 command */
export interface UpdateVocabularyRelationCommand extends VocabularyRelationsMergeContext {
  vocabularyId: string;
  relationId: string;
  input: {
    type?: MeaningRelationType;
    direction?: MeaningRelationDirection;
    status?: MeaningRelationStatus;
  };
}

const mapDomainError = (error: unknown): never => {
  if (error instanceof VocabularyRelationsMergeAdminError) throw error;
  if (error instanceof VocabularyRelationsMergeError) {
    throw new VocabularyRelationsMergeAdminError(error.code);
  }
  if (error instanceof VocabularyRelationsMergeRepositoryError) {
    throw new VocabularyRelationsMergeAdminError(error.code);
  }
  if (
    error instanceof VocabularyAdminRepositoryError &&
    error.code !== 'VOCABULARY_DUPLICATE' &&
    error.code !== 'VOCABULARY_IN_USE' &&
    error.code !== 'VOCABULARY_PERSISTENCE_CONFLICT'
  ) {
    throw new VocabularyRelationsMergeAdminError(error.code);
  }
  throw error;
};

const toPreviewVocabulary = (graph: VocabularyMergeGraph) => ({
  id: graph.vocabulary.id,
  thai: graph.vocabulary.thai,
  normalizedThai: graph.vocabulary.normalizedThai,
  kind: graph.vocabulary.kind,
  status: graph.vocabulary.status as 'DRAFT' | 'PUBLISHED' | 'HIDDEN',
  meaningCount: graph.meanings.length,
  pronunciationCount: graph.pronunciations.length,
  usage: {
    tokenOccurrences: graph.tokenOccurrenceIds.length,
    expressionOccurrences: graph.expressionOccurrenceIds.length,
    savedMemberships: graph.savedMemberships.length,
    wordbookMemberships: graph.wordbookMemberships.length,
    practiceQuestions: graph.practiceQuestionIds.length,
  },
});

/** 관계 불변 조건과 stale-safe 병합을 저장소 transaction 경계에 전달한다 */
export class VocabularyRelationsMergeService {
  constructor(
    private readonly repository: VocabularyRelationsMergeRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}

  /** 두 뜻의 소유권을 확인하고 canonical PENDING 관계를 생성한다 */
  async createRelation(
    command: CreateVocabularyRelationCommand,
  ): Promise<VocabularyRelationsMergeStoredRelation> {
    try {
      const relation = assertMeaningRelation(command.input);
      const owners = await this.repository.findMeaningOwners([
        relation.sourceMeaningId,
        relation.targetMeaningId,
      ]);
      const ownerByMeaning = new Map(
        owners.map(({ meaningId, vocabularyId }) => [meaningId, vocabularyId]),
      );
      if (
        ownerByMeaning.get(relation.sourceMeaningId) !== command.vocabularyId ||
        !ownerByMeaning.has(relation.targetMeaningId)
      ) {
        throw new VocabularyRelationsMergeAdminError(
          'MEANING_RELATION_NOT_FOUND',
        );
      }
      return await this.repository.createRelation({
        id: this.generateId(),
        vocabularyId: command.vocabularyId,
        ...relation,
        status: 'PENDING',
        createdAt: command.occurredAt,
        updatedAt: command.occurredAt,
      });
    } catch (error) {
      return mapDomainError(error);
    }
  }

  /** 관계 메타 변경은 재검토 PENDING으로 되돌리고 terminal 직행을 막는다 */
  async updateRelation(
    command: UpdateVocabularyRelationCommand,
  ): Promise<VocabularyRelationsMergeStoredRelation> {
    try {
      const current = await this.repository.findRelation(command);
      if (!current) {
        throw new VocabularyRelationsMergeAdminError(
          'MEANING_RELATION_NOT_FOUND',
        );
      }
      const metadataChanged =
        command.input.type !== undefined ||
        command.input.direction !== undefined;
      const relation = assertMeaningRelation({
        sourceMeaningId: current.sourceMeaningId,
        targetMeaningId: current.targetMeaningId,
        type: command.input.type ?? current.type,
        direction: command.input.direction ?? current.direction,
      });
      const status = metadataChanged
        ? 'PENDING'
        : assertMeaningRelationStatusTransition(
            current.status,
            command.input.status ?? current.status,
          );
      return await this.repository.updateRelation({
        ...current,
        ...relation,
        status,
        updatedAt: command.occurredAt,
      });
    } catch (error) {
      return mapDomainError(error);
    }
  }

  /** 경로 어휘에 속한 관계만 삭제한다 */
  async deleteRelation(input: {
    vocabularyId: string;
    relationId: string;
  }): Promise<void> {
    try {
      if (!(await this.repository.deleteRelation(input))) {
        throw new VocabularyRelationsMergeAdminError(
          'MEANING_RELATION_NOT_FOUND',
        );
      }
    } catch (error) {
      return mapDomainError(error);
    }
  }

  /** 현재 두 graph와 사용처·정규화 비교·opaque token을 반환한다 */
  async previewMerge(
    sourceVocabularyId: string,
    representativeVocabularyId: string,
  ) {
    try {
      const pair = await this.repository.loadMergePair(
        sourceVocabularyId,
        representativeVocabularyId,
      );
      if (!pair) {
        throw new VocabularyRelationsMergeAdminError('VOCABULARY_NOT_FOUND');
      }
      assertVocabularyMergePair(pair.source, pair.representative);
      return {
        source: toPreviewVocabulary(pair.source),
        representative: {
          ...toPreviewVocabulary(pair.representative),
          status: 'PUBLISHED' as const,
        },
        comparison: {
          normalizedEqual:
            pair.source.vocabulary.normalizedThai ===
            pair.representative.vocabulary.normalizedThai,
          codePointDistance: getNormalizedCodePointDistance(
            pair.source.vocabulary.normalizedThai,
            pair.representative.vocabulary.normalizedThai,
          ),
        },
        mergeToken: createVocabularyMergeFingerprint(
          pair.source,
          pair.representative,
        ),
      };
    } catch (error) {
      return mapDomainError(error);
    }
  }

  /** preview token을 SERIALIZABLE 저장소 실행에 전달한다 */
  async merge(
    command: VocabularyRelationsMergeContext & {
      sourceVocabularyId: string;
      representativeVocabularyId: string;
      mergeToken: string;
    },
  ): Promise<VocabularyMergeStoredResult> {
    try {
      return await this.repository.executeMerge({
        sourceVocabularyId: command.sourceVocabularyId,
        representativeVocabularyId: command.representativeVocabularyId,
        expectedFingerprint: command.mergeToken,
        actorSub: command.actorSub,
        actorUserId: command.actorUserId,
        requestId: command.requestId,
        occurredAt: command.occurredAt,
      });
    } catch (error) {
      return mapDomainError(error);
    }
  }
}

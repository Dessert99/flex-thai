/** 관리자 어휘의 strict 전체 교체와 게시·숨김·복구 수명을 조정한다 */
import { randomUUID } from 'node:crypto';
import {
  type VocabularyAdminAuditInput,
  type VocabularyAdminReplacementGraph,
  type VocabularyAdminRepository,
  VocabularyAdminRepositoryError,
} from './vocabulary-admin.repository.js';
import type { VocabularyRelationsMergeRepository } from './vocabulary-relations-merge.repository.js';
import {
  type CreateVocabularyRelationCommand,
  type UpdateVocabularyRelationCommand,
  VocabularyRelationsMergeService,
} from './vocabulary-relations-merge.service.js';
import {
  createVocabularyDraft,
  type Vocabulary,
  VocabularyDomainError,
} from './vocabulary.js';

const STANDARD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** 관리자 어휘 command가 받는 뜻 입력 */
export interface VocabularyAdminMeaningInput {
  clientRef: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty?: number | null;
  contextNote?: string | null;
}

/** 공개 계약을 통과한 관리자 어휘 전체 교체 입력 */
export interface VocabularyAdminReplaceInput {
  thai: string;
  kind: Vocabulary['kind'];
  meanings: VocabularyAdminMeaningInput[];
}

/** 관리자 어휘 command의 인증·감사 문맥 */
export interface VocabularyAdminCommandContext {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  occurredAt: Date;
}

/** 특정 DRAFT 어휘와 child 전체를 바꾸는 명령 */
export interface ReplaceVocabularyCommand extends VocabularyAdminCommandContext {
  vocabularyId: string;
  input: VocabularyAdminReplaceInput;
}

/** 특정 어휘의 게시·숨김·복구 명령 */
export interface TransitionVocabularyCommand extends VocabularyAdminCommandContext {
  vocabularyId: string;
}

/** 관리자 변경 성공 뒤 공개 응답으로 변환할 어휘 요약 */
export interface VocabularyAdminResult {
  id: string;
  status: Vocabulary['status'];
}

/** 관리자 어휘 예상 실패를 API가 안정적으로 분기할 code로 전달한다 */
export type VocabularyAdminErrorCode =
  | 'VOCABULARY_NOT_FOUND'
  | 'VOCABULARY_DUPLICATE'
  | 'VOCABULARY_IN_USE'
  | 'VOCABULARY_CONTENT_INVALID'
  | 'VOCABULARY_STATE_CONFLICT';

/** 관리자 어휘 실패의 안정적인 code와 선택적 공개 입력 path */
export class VocabularyAdminError extends Error {
  constructor(
    readonly code: VocabularyAdminErrorCode,
    readonly path?: string,
  ) {
    super(code);
    this.name = 'VocabularyAdminError';
  }
}

type UnknownRecord = Record<string, unknown>;

const failInvalidContent = (path: string): never => {
  throw new VocabularyAdminError('VOCABULARY_CONTENT_INVALID', path);
};

const requireRecord = (value: unknown, path: string): UnknownRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failInvalidContent(path);
  }
  return value as UnknownRecord;
};

const requireExactKeys = (
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void => {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    failInvalidContent(path);
  }
};

const requireNonemptyString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    return failInvalidContent(path);
  }
  return value;
};

const requireArray = (value: unknown, path: string, minimum = 1): unknown[] => {
  if (!Array.isArray(value) || value.length < minimum) {
    return failInvalidContent(path);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      failInvalidContent(`${path}.${index}`);
    }
  }
  return value;
};

const requireDifficulty = (value: unknown, path: string): number | null => {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 5
  ) {
    return failInvalidContent(path);
  }
  return value;
};

const requireNullableNonemptyString = (
  value: unknown,
  path: string,
): string | null => {
  if (value === undefined || value === null) return null;
  return requireNonemptyString(value, path);
};

const assertUnique = (values: readonly string[], path: string): void => {
  if (new Set(values).size !== values.length) {
    failInvalidContent(path);
  }
};

const assertReplaceInput = (value: unknown): VocabularyAdminReplaceInput => {
  const input = requireRecord(value, 'vocabulary');
  requireExactKeys(input, ['thai', 'kind', 'meanings'], [], 'vocabulary');
  const thai = requireNonemptyString(input.thai, 'thai');
  const kind: Vocabulary['kind'] =
    input.kind === 'WORD'
      ? 'WORD'
      : input.kind === 'EXPRESSION'
        ? 'EXPRESSION'
        : failInvalidContent('kind');

  const meanings = requireArray(input.meanings, 'meanings').map(
    (value, index): VocabularyAdminMeaningInput => {
      const path = `meanings.${index}`;
      const meaning = requireRecord(value, path);
      requireExactKeys(
        meaning,
        ['clientRef', 'meaningKo', 'partOfSpeech'],
        ['difficulty', 'contextNote'],
        path,
      );
      return {
        clientRef: requireNonemptyString(
          meaning.clientRef,
          `${path}.clientRef`,
        ),
        meaningKo: requireNonemptyString(
          meaning.meaningKo,
          `${path}.meaningKo`,
        ),
        partOfSpeech: requireNonemptyString(
          meaning.partOfSpeech,
          `${path}.partOfSpeech`,
        ),
        difficulty: requireDifficulty(meaning.difficulty, `${path}.difficulty`),
        contextNote: requireNullableNonemptyString(
          meaning.contextNote,
          `${path}.contextNote`,
        ),
      };
    },
  );

  assertUnique(
    meanings.map(({ clientRef }) => clientRef),
    'meanings',
  );
  return {
    thai,
    kind,
    meanings,
  };
};

const assertGeneratedId = (generateId: () => string): string => {
  const id = generateId();
  if (!STANDARD_UUID_PATTERN.test(id)) {
    throw new VocabularyAdminError('VOCABULARY_CONTENT_INVALID', 'generatedId');
  }
  return id;
};

const createAudit = (
  command: VocabularyAdminCommandContext & { vocabularyId: string },
  input: {
    action: VocabularyAdminAuditInput['action'];
    summary: Record<string, unknown>;
  },
): VocabularyAdminAuditInput => ({
  actorSub: command.actorSub,
  actorUserId: command.actorUserId,
  action: input.action,
  targetType: 'VOCABULARY',
  targetId: command.vocabularyId,
  summary: input.summary,
  requestId: command.requestId,
  occurredAt: command.occurredAt,
});

const toResult = (
  id: string,
  status: Vocabulary['status'],
): VocabularyAdminResult => ({ id, status });

/** 잠금 아래 관리자 어휘 전체 교체와 exact 상태 전이를 원자 실행한다 */
export class VocabularyAdminService {
  private readonly relationsMerge: VocabularyRelationsMergeService;

  constructor(
    private readonly repository: VocabularyAdminRepository,
    private readonly generateId: () => string = randomUUID,
  ) {
    this.relationsMerge = new VocabularyRelationsMergeService(
      repository as VocabularyAdminRepository &
        VocabularyRelationsMergeRepository,
      generateId,
    );
  }

  /** 미사용 DRAFT만 새 child UUID와 명시적 mapping으로 전체 교체한다 */
  async setImportance(
    command: VocabularyAdminCommandContext & {
      vocabularyId: string;
      importanceWeight: number;
    },
  ): Promise<void> {
    if (
      !Number.isSafeInteger(command.importanceWeight) ||
      command.importanceWeight < 1 ||
      command.importanceWeight > 10
    )
      throw new VocabularyAdminError(
        'VOCABULARY_CONTENT_INVALID',
        'importanceWeight',
      );
    await this.repository.runInTransaction(async (transaction) => {
      const current = await transaction.lockVocabularyGraph(
        command.vocabularyId,
      );
      if (!current) throw new VocabularyAdminError('VOCABULARY_NOT_FOUND');
      if (current.vocabulary.status === 'MERGED')
        throw new VocabularyAdminError('VOCABULARY_STATE_CONFLICT');
      await transaction.setImportanceWeight(
        command.vocabularyId,
        command.importanceWeight,
        command.occurredAt,
      );
      await transaction.appendAuditLog({
        ...command,
        action: 'VOCABULARY_IMPORTANCE_CHANGED',
        targetType: 'VOCABULARY',
        targetId: command.vocabularyId,
        summary: { importanceWeight: command.importanceWeight },
      });
    });
  }

  async replace(
    command: ReplaceVocabularyCommand,
  ): Promise<VocabularyAdminResult> {
    const input = assertReplaceInput(command.input);
    let draft: Vocabulary;
    try {
      draft = createVocabularyDraft({
        id: command.vocabularyId,
        thai: input.thai,
        kind: input.kind,
      });
    } catch (error) {
      if (error instanceof VocabularyDomainError) {
        throw new VocabularyAdminError('VOCABULARY_CONTENT_INVALID', 'thai');
      }
      throw error;
    }

    try {
      return await this.repository.runInTransaction(async (transaction) => {
        const current = await transaction.lockVocabularyGraph(
          command.vocabularyId,
        );
        if (!current) {
          throw new VocabularyAdminError('VOCABULARY_NOT_FOUND');
        }
        if (current.vocabulary.status !== 'DRAFT') {
          throw new VocabularyAdminError('VOCABULARY_STATE_CONFLICT');
        }
        if (
          await transaction.hasQuestionUsage({
            vocabularyId: current.vocabulary.id,
            meaningIds: current.meanings.map(({ id }) => id),
          })
        ) {
          throw new VocabularyAdminError('VOCABULARY_IN_USE');
        }
        if (
          await transaction.findDuplicateVocabularyId(
            draft.normalizedThai,
            current.vocabulary.id,
          )
        ) {
          throw new VocabularyAdminError('VOCABULARY_DUPLICATE', 'thai');
        }

        const graph: VocabularyAdminReplacementGraph = {
          vocabulary: { ...draft, updatedAt: command.occurredAt },
          meanings: input.meanings.map((meaning) => {
            const id = assertGeneratedId(this.generateId);
            return {
              id,
              vocabularyId: current.vocabulary.id,
              meaningKo: meaning.meaningKo,
              partOfSpeech: meaning.partOfSpeech,
              difficulty: meaning.difficulty ?? null,
              contextNote: meaning.contextNote ?? null,
            };
          }),
        };
        assertUnique(
          graph.meanings.map(({ id }) => id),
          'generatedId',
        );
        await transaction.replaceVocabulary(graph);
        await transaction.appendAuditLog(
          createAudit(command, {
            action: 'VOCABULARY_REPLACED',
            summary: {
              kind: input.kind,
              meaningCount: graph.meanings.length,
            },
          }),
        );
        return toResult(current.vocabulary.id, 'DRAFT');
      });
    } catch (error) {
      if (
        error instanceof VocabularyAdminRepositoryError &&
        error.code === 'VOCABULARY_DUPLICATE'
      ) {
        throw new VocabularyAdminError('VOCABULARY_DUPLICATE', 'thai');
      }
      if (
        error instanceof VocabularyAdminRepositoryError &&
        error.code === 'VOCABULARY_IN_USE'
      ) {
        throw new VocabularyAdminError('VOCABULARY_IN_USE');
      }
      if (error instanceof VocabularyAdminRepositoryError) {
        throw new VocabularyAdminError('VOCABULARY_STATE_CONFLICT');
      }
      throw error;
    }
  }

  async publish(
    command: TransitionVocabularyCommand,
  ): Promise<VocabularyAdminResult> {
    return this.transition(command, {
      expectedStatus: 'DRAFT',
      nextStatus: 'PUBLISHED',
      action: 'VOCABULARY_PUBLISHED',
    });
  }

  /** PUBLISHED 어휘만 참조를 보존한 HIDDEN으로 바꾼다 */
  async hide(
    command: TransitionVocabularyCommand,
  ): Promise<VocabularyAdminResult> {
    return this.transition(command, {
      expectedStatus: 'PUBLISHED',
      nextStatus: 'HIDDEN',
      action: 'VOCABULARY_HIDDEN',
    });
  }

  /** HIDDEN 어휘만 다시 PUBLISHED로 복구한다 */
  async restore(
    command: TransitionVocabularyCommand,
  ): Promise<VocabularyAdminResult> {
    return this.transition(command, {
      expectedStatus: 'HIDDEN',
      nextStatus: 'PUBLISHED',
      action: 'VOCABULARY_RESTORED',
    });
  }

  /** 두 뜻의 소유권을 확인하고 PENDING 관계를 생성한다 */
  async createRelation(command: CreateVocabularyRelationCommand) {
    return this.relationsMerge.createRelation(command);
  }

  /** 관계 메타데이터 또는 검토 상태를 불변 조건 아래 변경한다 */
  async updateRelation(command: UpdateVocabularyRelationCommand) {
    return this.relationsMerge.updateRelation(command);
  }

  /** 경로 어휘에 연결된 뜻 관계를 삭제한다 */
  async deleteRelation(input: {
    vocabularyId: string;
    relationId: string;
  }): Promise<void> {
    return this.relationsMerge.deleteRelation(input);
  }

  /** 현재 source·대표 graph의 병합 비교와 opaque token을 반환한다 */
  async previewMerge(
    sourceVocabularyId: string,
    representativeVocabularyId: string,
  ) {
    return this.relationsMerge.previewMerge(
      sourceVocabularyId,
      representativeVocabularyId,
    );
  }

  /** 같은 preview token일 때만 live 참조를 대표 어휘로 병합한다 */
  async merge(
    command: Parameters<VocabularyRelationsMergeService['merge']>[0],
  ) {
    return this.relationsMerge.merge(command);
  }

  private async transition(
    command: TransitionVocabularyCommand,
    rule: {
      expectedStatus: Vocabulary['status'];
      nextStatus: Vocabulary['status'];
      action: VocabularyAdminAuditInput['action'];
    },
  ): Promise<VocabularyAdminResult> {
    try {
      return await this.repository.runInTransaction(async (transaction) => {
        const current = await transaction.lockVocabularyGraph(
          command.vocabularyId,
        );
        if (!current) {
          throw new VocabularyAdminError('VOCABULARY_NOT_FOUND');
        }
        if (current.vocabulary.status !== rule.expectedStatus) {
          throw new VocabularyAdminError('VOCABULARY_STATE_CONFLICT');
        }
        await transaction.transitionVocabularyStatus({
          vocabularyId: current.vocabulary.id,
          expectedStatus: rule.expectedStatus,
          nextStatus: rule.nextStatus,
          publishedAt:
            rule.nextStatus === 'PUBLISHED' ? command.occurredAt : undefined,
          updatedAt: command.occurredAt,
        });
        await transaction.appendAuditLog(
          createAudit(command, {
            action: rule.action,
            summary: {
              previousStatus: rule.expectedStatus,
              nextStatus: rule.nextStatus,
            },
          }),
        );
        return toResult(current.vocabulary.id, rule.nextStatus);
      });
    } catch (error) {
      if (error instanceof VocabularyAdminRepositoryError) {
        throw new VocabularyAdminError('VOCABULARY_STATE_CONFLICT');
      }
      throw error;
    }
  }
}

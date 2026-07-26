/** 관리자 어휘의 strict 전체 교체와 게시·숨김·복구 수명을 조정한다 */
import { randomUUID } from 'node:crypto';
import {
  type VocabularyAdminAuditInput,
  type VocabularyAdminRepository,
  VocabularyAdminRepositoryError,
  type VocabularyAdminReplacementGraph,
  type VocabularyAdminTransaction,
} from './vocabulary-admin.repository.js';
import {
  createVocabularyDraft,
  type Vocabulary,
  VocabularyDomainError,
} from './vocabulary.js';

const STANDARD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const isContractUuid = (value: string): boolean =>
  STANDARD_UUID_PATTERN.test(value) || value === NIL_UUID || value === MAX_UUID;

/** 관리자 어휘 command가 받는 뜻 입력 */
export interface VocabularyAdminMeaningInput {
  clientRef: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty?: number | null;
  contextNote?: string | null;
}

/** 관리자 어휘 command가 받는 발음 입력 */
export interface VocabularyAdminPronunciationInput {
  clientRef: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
}

/** 관리자 어휘 command가 받는 뜻·발음 연결 입력 */
export interface VocabularyAdminMeaningPronunciationInput {
  meaningRef: string;
  pronunciationRef: string;
}

/** 공개 계약을 통과한 관리자 어휘 전체 교체 입력 */
export interface VocabularyAdminReplaceInput {
  thai: string;
  kind: Vocabulary['kind'];
  meanings: VocabularyAdminMeaningInput[];
  pronunciations: VocabularyAdminPronunciationInput[];
  meaningPronunciations: VocabularyAdminMeaningPronunciationInput[];
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
  | 'VOCABULARY_MEDIA_NOT_FOUND'
  | 'VOCABULARY_AUDIO_NOT_READY'
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

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
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

const requireContractUuid = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !isContractUuid(value)) {
    return failInvalidContent(path);
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
  requireExactKeys(
    input,
    ['thai', 'kind', 'meanings', 'pronunciations', 'meaningPronunciations'],
    [],
    'vocabulary',
  );
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
  const pronunciations = requireArray(
    input.pronunciations,
    'pronunciations',
  ).map((value, index): VocabularyAdminPronunciationInput => {
    const path = `pronunciations.${index}`;
    const pronunciation = requireRecord(value, path);
    requireExactKeys(
      pronunciation,
      ['clientRef', 'pronunciationKo', 'toneMarks', 'mediaAssetId'],
      [],
      path,
    );
    return {
      clientRef: requireNonemptyString(
        pronunciation.clientRef,
        `${path}.clientRef`,
      ),
      pronunciationKo: requireNonemptyString(
        pronunciation.pronunciationKo,
        `${path}.pronunciationKo`,
      ),
      toneMarks: requireString(pronunciation.toneMarks, `${path}.toneMarks`),
      mediaAssetId: requireContractUuid(
        pronunciation.mediaAssetId,
        `${path}.mediaAssetId`,
      ),
    };
  });
  assertUnique(
    [
      ...meanings.map(({ clientRef }) => clientRef),
      ...pronunciations.map(({ clientRef }) => clientRef),
    ],
    'meanings',
  );

  const meaningRefs = new Set(meanings.map(({ clientRef }) => clientRef));
  const pronunciationRefs = new Set(
    pronunciations.map(({ clientRef }) => clientRef),
  );
  const meaningPronunciations = requireArray(
    input.meaningPronunciations,
    'meaningPronunciations',
  ).map((value, index): VocabularyAdminMeaningPronunciationInput => {
    const path = `meaningPronunciations.${index}`;
    const mapping = requireRecord(value, path);
    requireExactKeys(mapping, ['meaningRef', 'pronunciationRef'], [], path);
    const meaningRef = requireNonemptyString(
      mapping.meaningRef,
      `${path}.meaningRef`,
    );
    const pronunciationRef = requireNonemptyString(
      mapping.pronunciationRef,
      `${path}.pronunciationRef`,
    );
    if (!meaningRefs.has(meaningRef)) {
      failInvalidContent(`${path}.meaningRef`);
    }
    if (!pronunciationRefs.has(pronunciationRef)) {
      failInvalidContent(`${path}.pronunciationRef`);
    }
    return { meaningRef, pronunciationRef };
  });
  assertUnique(
    meaningPronunciations.map(
      ({ meaningRef, pronunciationRef }) => `${meaningRef}:${pronunciationRef}`,
    ),
    'meaningPronunciations',
  );
  return {
    thai,
    kind,
    meanings,
    pronunciations,
    meaningPronunciations,
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

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const requireAllMedia = async (
  transaction: VocabularyAdminTransaction,
  mediaAssetIds: string[],
  requirement: 'EXISTS' | 'READY',
): Promise<void> => {
  const expectedIds = unique(mediaAssetIds);
  const media = await transaction.findMediaAssetsByIds(expectedIds);
  const mediaById = new Map(media.map((asset) => [asset.id, asset]));
  if (expectedIds.some((id) => !mediaById.has(id))) {
    throw new VocabularyAdminError(
      requirement === 'EXISTS'
        ? 'VOCABULARY_MEDIA_NOT_FOUND'
        : 'VOCABULARY_AUDIO_NOT_READY',
    );
  }
  if (
    requirement === 'READY' &&
    expectedIds.some((id) => mediaById.get(id)?.status !== 'READY')
  ) {
    throw new VocabularyAdminError('VOCABULARY_AUDIO_NOT_READY');
  }
};

const toResult = (
  id: string,
  status: Vocabulary['status'],
): VocabularyAdminResult => ({ id, status });

/** 잠금 아래 관리자 어휘 전체 교체와 exact 상태 전이를 원자 실행한다 */
export class VocabularyAdminService {
  constructor(
    private readonly repository: VocabularyAdminRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}

  /** 미사용 DRAFT만 새 child UUID와 명시적 mapping으로 전체 교체한다 */
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
            pronunciationIds: current.pronunciations.map(({ id }) => id),
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
        await requireAllMedia(
          transaction,
          input.pronunciations.map(({ mediaAssetId }) => mediaAssetId),
          'EXISTS',
        );

        const meaningIds = new Map<string, string>();
        const pronunciationIds = new Map<string, string>();
        const graph: VocabularyAdminReplacementGraph = {
          vocabulary: { ...draft, updatedAt: command.occurredAt },
          meanings: input.meanings.map((meaning) => {
            const id = assertGeneratedId(this.generateId);
            meaningIds.set(meaning.clientRef, id);
            return {
              id,
              vocabularyId: current.vocabulary.id,
              meaningKo: meaning.meaningKo,
              partOfSpeech: meaning.partOfSpeech,
              difficulty: meaning.difficulty ?? null,
              contextNote: meaning.contextNote ?? null,
            };
          }),
          pronunciations: input.pronunciations.map((pronunciation) => {
            const id = assertGeneratedId(this.generateId);
            pronunciationIds.set(pronunciation.clientRef, id);
            return {
              id,
              vocabularyId: current.vocabulary.id,
              pronunciationKo: pronunciation.pronunciationKo,
              toneMarks: pronunciation.toneMarks,
              mediaAssetId: pronunciation.mediaAssetId,
            };
          }),
          meaningPronunciations: [],
        };
        assertUnique(
          [
            ...graph.meanings.map(({ id }) => id),
            ...graph.pronunciations.map(({ id }) => id),
          ],
          'generatedId',
        );
        graph.meaningPronunciations = input.meaningPronunciations.map(
          ({ meaningRef, pronunciationRef }) => ({
            vocabularyId: current.vocabulary.id,
            meaningId: meaningIds.get(meaningRef)!,
            pronunciationId: pronunciationIds.get(pronunciationRef)!,
          }),
        );
        await transaction.replaceVocabulary(graph);
        await transaction.appendAuditLog(
          createAudit(command, {
            action: 'VOCABULARY_REPLACED',
            summary: {
              kind: input.kind,
              meaningCount: graph.meanings.length,
              pronunciationCount: graph.pronunciations.length,
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

  /** 발음이 있고 모든 current media가 READY인 DRAFT만 게시한다 */
  async publish(
    command: TransitionVocabularyCommand,
  ): Promise<VocabularyAdminResult> {
    return this.transition(command, {
      expectedStatus: 'DRAFT',
      nextStatus: 'PUBLISHED',
      action: 'VOCABULARY_PUBLISHED',
      requireReadyMedia: true,
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
      requireReadyMedia: false,
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
      requireReadyMedia: false,
    });
  }

  private async transition(
    command: TransitionVocabularyCommand,
    rule: {
      expectedStatus: Vocabulary['status'];
      nextStatus: Vocabulary['status'];
      action: VocabularyAdminAuditInput['action'];
      requireReadyMedia: boolean;
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
        if (rule.requireReadyMedia) {
          if (current.pronunciations.length === 0) {
            throw new VocabularyAdminError('VOCABULARY_AUDIO_NOT_READY');
          }
          const mediaAssetIds = current.pronunciations.map(
            ({ mediaAssetId }) => mediaAssetId,
          );
          if (mediaAssetIds.some((id) => id === null)) {
            throw new VocabularyAdminError('VOCABULARY_AUDIO_NOT_READY');
          }
          await requireAllMedia(
            transaction,
            mediaAssetIds as string[],
            'READY',
          );
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

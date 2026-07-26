/** 관리자 문제 버전을 복제하거나 canonical DRAFT graph로 전체 교체한다 */
import { randomUUID } from 'node:crypto';
import type {
  CanonicalDraftQuestionInput,
  CanonicalDraftSentenceInput,
  ContentDraftReference,
} from '../content-import/content-import.js';
import type {
  ResolvedQuestionSentenceGraph,
  VocabularyMeaningReferenceRecord,
  VocabularyPronunciationReferenceRecord,
  VocabularyReferenceRecord,
} from '../content-import/content-draft.repository.js';
import { assertMediaAssetReady } from '../media/media-asset.js';
import {
  resolveRepresentativeExpressions,
  validateThaiSentenceVersion,
  type ThaiExpressionOccurrenceInput,
  type ThaiSentenceVersionInput,
} from '../thai-content/thai-sentence-version.js';
import type {
  QuestionAdminRepository,
  QuestionAdminTransaction,
  QuestionAdminVersionGraph,
  QuestionAdminVersionSource,
} from './question-admin.repository.js';

const STANDARD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const isCanonicalUuid = (value: string): boolean =>
  STANDARD_UUID_PATTERN.test(value) || value === NIL_UUID || value === MAX_UUID;

/** 관리자 문제 변경 실패를 API가 안정적으로 분기할 code로 전달한다 */
export type QuestionAdminErrorCode =
  | 'QUESTION_NOT_FOUND'
  | 'QUESTION_VERSION_NOT_FOUND'
  | 'QUESTION_VERSION_MISMATCH'
  | 'QUESTION_TYPE_NOT_FOUND'
  | 'QUESTION_REFERENCE_NOT_FOUND'
  | 'QUESTION_REFERENCE_MISMATCH'
  | 'QUESTION_MEDIA_NOT_READY'
  | 'QUESTION_CONTENT_INVALID'
  | 'IMMUTABLE_VERSION';

/** 관리자 문제 초안 복제·교체 실패의 안정적인 code와 선택적 path */
export class QuestionAdminError extends Error {
  constructor(
    readonly code: QuestionAdminErrorCode,
    readonly path?: string,
  ) {
    super(code);
    this.name = 'QuestionAdminError';
  }
}

/** 문제 초안 변경과 감사에 필요한 관리자 요청 문맥 */
export interface QuestionAdminCommandContext {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  occurredAt: Date;
}

/** 논리 문제에서 다음 DRAFT 버전을 생성하는 명령 */
export interface CloneQuestionVersionCommand extends QuestionAdminCommandContext {
  questionId: string;
}

/** canonical payload로 특정 DRAFT 버전을 전체 교체하는 명령 */
export interface ReplaceQuestionVersionCommand extends QuestionAdminCommandContext {
  versionId: string;
  input: Omit<CanonicalDraftQuestionInput, 'clientRef'>;
}

/** 복제·교체 성공 뒤 공개 응답으로 변환할 DRAFT 요약 */
export interface QuestionAdminVersionResult {
  questionId: string;
  versionId: string;
  version: number;
  status: 'DRAFT';
  validationStatus: 'PENDING';
}

const assertGeneratedId = (generateId: () => string): string => {
  const id = generateId();
  if (!STANDARD_UUID_PATTERN.test(id)) {
    throw new QuestionAdminError('QUESTION_CONTENT_INVALID', 'generatedId');
  }
  return id;
};

const assertSourceBelongsToQuestion = (
  source: QuestionAdminVersionSource,
  questionId: string,
): void => {
  if (source.questionId !== questionId) {
    throw new QuestionAdminError('QUESTION_VERSION_MISMATCH');
  }
};

const createDraftVersion = (input: {
  id: string;
  questionId: string;
  version: number;
  typeVersionId: string;
  difficulty: number;
}): QuestionAdminVersionGraph['version'] => ({
  ...input,
  status: 'DRAFT',
  validationStatus: 'PENDING',
  validationIssues: [],
  validatedAt: null,
  publishedAt: null,
});

type UnknownRecord = Record<string, unknown>;

const failInvalidContent = (path: string): never => {
  throw new QuestionAdminError('QUESTION_CONTENT_INVALID', path);
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

const requireSafeInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return failInvalidContent(path);
  }
  return value;
};

const requireArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    return failInvalidContent(path);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      failInvalidContent(`${path}.${index}`);
    }
  }
  return value;
};

const requireEnum = (
  value: unknown,
  allowed: readonly string[],
  path: string,
): string => {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return failInvalidContent(path);
  }
  return value;
};

const requireUuid = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !isCanonicalUuid(value)) {
    return failInvalidContent(path);
  }
  return value;
};

const assertReference = (value: unknown, path: string): void => {
  const reference = requireRecord(value, path);
  const keys = Object.keys(reference);
  if (keys.length !== 1) {
    failInvalidContent(path);
  }
  if (keys[0] === 'id') {
    requireUuid(reference.id, `${path}.id`);
    return;
  }
  if (keys[0] === 'clientRef') {
    requireNonemptyString(reference.clientRef, `${path}.clientRef`);
    // 전체 교체 요청에는 import 안에서 만든 clientRef를 해석할 문맥이 없다.
    throw new QuestionAdminError('QUESTION_REFERENCE_NOT_FOUND', path);
  }
  failInvalidContent(path);
};

const assertSentenceInput = (value: unknown, path: string): void => {
  const sentence = requireRecord(value, path);
  requireExactKeys(
    sentence,
    [
      'originalText',
      'translationKo',
      'pronunciationKo',
      'toneMarks',
      'mediaAssetId',
      'tokens',
      'expressions',
    ],
    [],
    path,
  );
  const originalText = requireNonemptyString(
    sentence.originalText,
    `${path}.originalText`,
  );
  requireNonemptyString(sentence.translationKo, `${path}.translationKo`);
  requireNonemptyString(sentence.pronunciationKo, `${path}.pronunciationKo`);
  if (typeof sentence.toneMarks !== 'string') {
    failInvalidContent(`${path}.toneMarks`);
  }
  requireUuid(sentence.mediaAssetId, `${path}.mediaAssetId`);

  const codePoints = Array.from(originalText);
  let previousEnd = 0;
  const tokens = requireArray(sentence.tokens, `${path}.tokens`);
  tokens.forEach((value, index) => {
    const tokenPath = `${path}.tokens.${index}`;
    const token = requireRecord(value, tokenPath);
    requireExactKeys(
      token,
      [
        'surface',
        'startOffset',
        'endOffset',
        'vocabulary',
        'meaning',
        'pronunciation',
        'contextMeaningKo',
        'role',
      ],
      [],
      tokenPath,
    );
    const surface = requireNonemptyString(
      token.surface,
      `${tokenPath}.surface`,
    );
    const startOffset = requireSafeInteger(
      token.startOffset,
      0,
      Number.MAX_SAFE_INTEGER,
      `${tokenPath}.startOffset`,
    );
    const endOffset = requireSafeInteger(
      token.endOffset,
      1,
      Number.MAX_SAFE_INTEGER,
      `${tokenPath}.endOffset`,
    );
    assertReference(token.vocabulary, `${tokenPath}.vocabulary`);
    assertReference(token.meaning, `${tokenPath}.meaning`);
    assertReference(token.pronunciation, `${tokenPath}.pronunciation`);
    requireNonemptyString(
      token.contextMeaningKo,
      `${tokenPath}.contextMeaningKo`,
    );
    requireEnum(
      token.role,
      ['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION'],
      `${tokenPath}.role`,
    );
    if (
      endOffset <= startOffset ||
      endOffset > codePoints.length ||
      startOffset < previousEnd
    ) {
      failInvalidContent(tokenPath);
    }
    if (codePoints.slice(startOffset, endOffset).join('') !== surface) {
      failInvalidContent(`${tokenPath}.surface`);
    }
    previousEnd = Math.max(previousEnd, endOffset);
  });

  const expressions = requireArray(sentence.expressions, `${path}.expressions`);
  expressions.forEach((value, index) => {
    const expressionPath = `${path}.expressions.${index}`;
    const expression = requireRecord(value, expressionPath);
    requireExactKeys(
      expression,
      [
        'startTokenIndex',
        'endTokenIndex',
        'vocabulary',
        'meaning',
        'pronunciation',
        'contextMeaningKo',
      ],
      ['representative'],
      expressionPath,
    );
    const startTokenIndex = requireSafeInteger(
      expression.startTokenIndex,
      0,
      Number.MAX_SAFE_INTEGER,
      `${expressionPath}.startTokenIndex`,
    );
    const endTokenIndex = requireSafeInteger(
      expression.endTokenIndex,
      1,
      Number.MAX_SAFE_INTEGER,
      `${expressionPath}.endTokenIndex`,
    );
    assertReference(expression.vocabulary, `${expressionPath}.vocabulary`);
    assertReference(expression.meaning, `${expressionPath}.meaning`);
    assertReference(
      expression.pronunciation,
      `${expressionPath}.pronunciation`,
    );
    requireNonemptyString(
      expression.contextMeaningKo,
      `${expressionPath}.contextMeaningKo`,
    );
    if (
      expression.representative !== undefined &&
      typeof expression.representative !== 'boolean'
    ) {
      failInvalidContent(`${expressionPath}.representative`);
    }
    if (endTokenIndex - startTokenIndex < 2 || endTokenIndex > tokens.length) {
      failInvalidContent(expressionPath);
    }
  });
};

const assertQuestionInput = (value: unknown): void => {
  const input = requireRecord(value, 'question');
  requireExactKeys(
    input,
    [
      'questionTypeSlug',
      'questionTypeVersion',
      'difficulty',
      'blocks',
      'options',
      'correctOptionRef',
    ],
    [],
    'question',
  );
  requireNonemptyString(input.questionTypeSlug, 'questionTypeSlug');
  requireSafeInteger(
    input.questionTypeVersion,
    1,
    Number.MAX_SAFE_INTEGER,
    'questionTypeVersion',
  );
  requireSafeInteger(input.difficulty, 1, 5, 'difficulty');

  const blocks = requireArray(input.blocks, 'blocks');
  if (blocks.length === 0) {
    failInvalidContent('blocks');
  }
  blocks.forEach((value, blockIndex) => {
    const blockPath = `blocks.${blockIndex}`;
    const block = requireRecord(value, blockPath);
    requireExactKeys(
      block,
      ['kind', 'displayMode', 'sentences'],
      [],
      blockPath,
    );
    requireEnum(
      block.kind,
      ['INSTRUCTION', 'PASSAGE', 'DIALOGUE', 'QUESTION', 'EXPLANATION'],
      `${blockPath}.kind`,
    );
    requireEnum(
      block.displayMode,
      ['TEXT', 'AUDIO', 'TEXT_AND_AUDIO', 'AUDIO_THEN_REVEAL'],
      `${blockPath}.displayMode`,
    );
    const sentences = requireArray(block.sentences, `${blockPath}.sentences`);
    if (sentences.length === 0) {
      failInvalidContent(`${blockPath}.sentences`);
    }
    sentences.forEach((value, sentenceIndex) => {
      const entryPath = `${blockPath}.sentences.${sentenceIndex}`;
      const entry = requireRecord(value, entryPath);
      requireExactKeys(entry, ['sentence'], ['speaker'], entryPath);
      if (
        entry.speaker !== undefined &&
        entry.speaker !== null &&
        (typeof entry.speaker !== 'string' || entry.speaker.length === 0)
      ) {
        failInvalidContent(`${entryPath}.speaker`);
      }
      assertSentenceInput(entry.sentence, `${entryPath}.sentence`);
    });
  });

  const options = requireArray(input.options, 'options');
  if (options.length === 0) {
    failInvalidContent('options');
  }
  const optionRefs = options.map((value, optionIndex) => {
    const optionPath = `options.${optionIndex}`;
    const option = requireRecord(value, optionPath);
    requireExactKeys(
      option,
      ['clientRef', 'position', 'sentence'],
      ['span'],
      optionPath,
    );
    const clientRef = requireNonemptyString(
      option.clientRef,
      `${optionPath}.clientRef`,
    );
    const position = requireSafeInteger(
      option.position,
      0,
      Number.MAX_SAFE_INTEGER,
      `${optionPath}.position`,
    );
    if (position !== optionIndex) {
      failInvalidContent(`${optionPath}.position`);
    }
    assertSentenceInput(option.sentence, `${optionPath}.sentence`);
    if (option.span !== undefined) {
      const span = requireRecord(option.span, `${optionPath}.span`);
      requireExactKeys(
        span,
        [
          'blockPosition',
          'sentencePosition',
          'startTokenIndex',
          'endTokenIndex',
        ],
        [],
        `${optionPath}.span`,
      );
      requireSafeInteger(
        span.blockPosition,
        0,
        Number.MAX_SAFE_INTEGER,
        `${optionPath}.span.blockPosition`,
      );
      requireSafeInteger(
        span.sentencePosition,
        0,
        Number.MAX_SAFE_INTEGER,
        `${optionPath}.span.sentencePosition`,
      );
      const start = requireSafeInteger(
        span.startTokenIndex,
        0,
        Number.MAX_SAFE_INTEGER,
        `${optionPath}.span.startTokenIndex`,
      );
      const end = requireSafeInteger(
        span.endTokenIndex,
        1,
        Number.MAX_SAFE_INTEGER,
        `${optionPath}.span.endTokenIndex`,
      );
      if (end <= start) failInvalidContent(`${optionPath}.span`);
    }
    return clientRef;
  });
  const correctOptionRef = requireNonemptyString(
    input.correctOptionRef,
    'correctOptionRef',
  );
  if (
    new Set(optionRefs).size !== optionRefs.length ||
    !optionRefs.includes(correctOptionRef)
  ) {
    failInvalidContent('correctOptionRef');
  }
};

const toResult = (
  version: QuestionAdminVersionGraph['version'],
): QuestionAdminVersionResult => ({
  questionId: version.questionId,
  versionId: version.id,
  version: version.version,
  status: version.status,
  validationStatus: version.validationStatus,
});

const requireReferenceId = (
  reference: ContentDraftReference,
  path: string,
): string => {
  if (
    !('id' in reference) ||
    typeof reference.id !== 'string' ||
    !isCanonicalUuid(reference.id)
  ) {
    throw new QuestionAdminError('QUESTION_REFERENCE_NOT_FOUND', path);
  }
  return reference.id;
};

const requireVocabulary = async (
  transaction: QuestionAdminTransaction,
  reference: ContentDraftReference,
  path: string,
): Promise<VocabularyReferenceRecord> => {
  const id = requireReferenceId(reference, path);
  const record = await transaction.findVocabularyById(id);
  if (!record) {
    throw new QuestionAdminError('QUESTION_REFERENCE_NOT_FOUND', path);
  }
  return record;
};

const requireMeaning = async (
  transaction: QuestionAdminTransaction,
  reference: ContentDraftReference,
  path: string,
): Promise<VocabularyMeaningReferenceRecord> => {
  const id = requireReferenceId(reference, path);
  const record = await transaction.findVocabularyMeaningById(id);
  if (!record) {
    throw new QuestionAdminError('QUESTION_REFERENCE_NOT_FOUND', path);
  }
  return record;
};

const requirePronunciation = async (
  transaction: QuestionAdminTransaction,
  reference: ContentDraftReference,
  path: string,
): Promise<VocabularyPronunciationReferenceRecord> => {
  const id = requireReferenceId(reference, path);
  const record = await transaction.findVocabularyPronunciationById(id);
  if (!record) {
    throw new QuestionAdminError('QUESTION_REFERENCE_NOT_FOUND', path);
  }
  return record;
};

const resolveSentence = async (input: {
  transaction: QuestionAdminTransaction;
  sentence: CanonicalDraftSentenceInput;
  path: string;
  newId: () => string;
}): Promise<ResolvedQuestionSentenceGraph> => {
  const mediaAsset = await input.transaction.findMediaAssetById(
    input.sentence.mediaAssetId,
  );
  if (!mediaAsset) {
    throw new QuestionAdminError(
      'QUESTION_REFERENCE_NOT_FOUND',
      `${input.path}.mediaAssetId`,
    );
  }
  try {
    assertMediaAssetReady(mediaAsset);
  } catch {
    throw new QuestionAdminError(
      'QUESTION_MEDIA_NOT_READY',
      `${input.path}.mediaAssetId`,
    );
  }

  const sentenceId = input.newId();
  const sentenceVersionId = input.newId();
  const tokens = [];
  for (const [index, token] of input.sentence.tokens.entries()) {
    const tokenPath = `${input.path}.tokens.${index}`;
    const vocabulary = await requireVocabulary(
      input.transaction,
      token.vocabulary,
      `${tokenPath}.vocabulary`,
    );
    const meaning = await requireMeaning(
      input.transaction,
      token.meaning,
      `${tokenPath}.meaning`,
    );
    const pronunciation = await requirePronunciation(
      input.transaction,
      token.pronunciation,
      `${tokenPath}.pronunciation`,
    );
    if (meaning.vocabularyId !== vocabulary.id) {
      throw new QuestionAdminError(
        'QUESTION_REFERENCE_MISMATCH',
        `${tokenPath}.meaning`,
      );
    }
    if (pronunciation.vocabularyId !== vocabulary.id) {
      throw new QuestionAdminError(
        'QUESTION_REFERENCE_MISMATCH',
        `${tokenPath}.pronunciation`,
      );
    }
    tokens.push({
      id: input.newId(),
      sentenceVersionId,
      position: index,
      surface: token.surface,
      startOffset: token.startOffset,
      endOffset: token.endOffset,
      vocabularyId: vocabulary.id,
      meaningId: meaning.id,
      pronunciationId: pronunciation.id,
      contextMeaningKo: token.contextMeaningKo,
      role: token.role,
    });
  }

  const expressionCandidates: ThaiExpressionOccurrenceInput[] = [];
  for (const [index, expression] of input.sentence.expressions.entries()) {
    const path = `${input.path}.expressions.${index}.vocabulary`;
    const vocabulary = await requireVocabulary(
      input.transaction,
      expression.vocabulary,
      path,
    );
    if (vocabulary.kind !== 'EXPRESSION') {
      throw new QuestionAdminError('QUESTION_REFERENCE_MISMATCH', path);
    }
    const meaning = await requireMeaning(
      input.transaction,
      expression.meaning,
      `${input.path}.expressions.${index}.meaning`,
    );
    const pronunciation = await requirePronunciation(
      input.transaction,
      expression.pronunciation,
      `${input.path}.expressions.${index}.pronunciation`,
    );
    if (
      meaning.vocabularyId !== vocabulary.id ||
      pronunciation.vocabularyId !== vocabulary.id
    ) {
      throw new QuestionAdminError(
        'QUESTION_REFERENCE_MISMATCH',
        `${input.path}.expressions.${index}`,
      );
    }
    expressionCandidates.push({
      startTokenIndex: expression.startTokenIndex,
      endTokenIndex: expression.endTokenIndex,
      vocabularyId: vocabulary.id,
      vocabularyKind: vocabulary.kind,
      meaningId: meaning.id,
      pronunciationId: pronunciation.id,
      contextMeaningKo: expression.contextMeaningKo,
      adminSelected: expression.representative ?? false,
    });
  }

  const validationInput: ThaiSentenceVersionInput = {
    originalText: input.sentence.originalText,
    translationKo: input.sentence.translationKo,
    pronunciationKo: input.sentence.pronunciationKo,
    toneMarks: input.sentence.toneMarks,
    mediaAssetId: input.sentence.mediaAssetId,
    tokens,
    expressions: expressionCandidates,
  };
  const issue = validateThaiSentenceVersion(validationInput)[0];
  if (issue) {
    throw new QuestionAdminError(
      'QUESTION_CONTENT_INVALID',
      `${input.path}.${issue.path}`,
    );
  }

  return {
    sentence: { id: sentenceId },
    version: {
      id: sentenceVersionId,
      sentenceId,
      version: 1,
      originalText: input.sentence.originalText,
      translationKo: input.sentence.translationKo,
      pronunciationKo: input.sentence.pronunciationKo,
      toneMarks: input.sentence.toneMarks,
      mediaAssetId: input.sentence.mediaAssetId,
      frozenAt: null,
    },
    tokens,
    expressions: resolveRepresentativeExpressions(expressionCandidates).map(
      (expression) => ({
        id: input.newId(),
        sentenceVersionId,
        startTokenIndex: expression.startTokenIndex,
        endTokenIndex: expression.endTokenIndex,
        vocabularyId: expression.vocabularyId,
        vocabularyKind: expression.vocabularyKind,
        meaningId: expression.meaningId,
        pronunciationId: expression.pronunciationId,
        contextMeaningKo: expression.contextMeaningKo,
        representative: expression.representative,
      }),
    ),
  };
};

/** row lock 뒤 복제 기준을 고르고 DRAFT 전체 교체를 원자 실행한다 */
export class QuestionAdminService {
  constructor(
    private readonly repository: QuestionAdminRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}

  /** 현재 게시 버전 또는 latest 내용을 재사용해 max version 다음 DRAFT를 만든다 */
  async cloneVersion(
    command: CloneQuestionVersionCommand,
  ): Promise<QuestionAdminVersionResult> {
    return this.repository.runInTransaction(async (transaction) => {
      const question = await transaction.loadQuestion(command.questionId);
      if (!question) {
        throw new QuestionAdminError('QUESTION_NOT_FOUND');
      }
      const latest = await transaction.loadLatestVersion(question.id);
      if (!latest) {
        throw new QuestionAdminError('QUESTION_VERSION_NOT_FOUND');
      }
      assertSourceBelongsToQuestion(latest, question.id);
      const source = question.currentPublishedVersionId
        ? await transaction.loadVersionSource(
            question.currentPublishedVersionId,
          )
        : latest;
      if (!source) {
        throw new QuestionAdminError('QUESTION_VERSION_NOT_FOUND');
      }
      assertSourceBelongsToQuestion(source, question.id);

      const versionId = assertGeneratedId(this.generateId);
      const graph: QuestionAdminVersionGraph = {
        version: createDraftVersion({
          id: versionId,
          questionId: question.id,
          version: latest.version + 1,
          typeVersionId: source.typeVersionId,
          difficulty: source.difficulty,
        }),
        sentences: [],
        blocks: source.blocks.map((block) => {
          const blockId = assertGeneratedId(this.generateId);
          return {
            id: blockId,
            questionVersionId: versionId,
            kind: block.kind,
            displayMode: block.displayMode,
            position: block.position,
            sentences: block.sentences.map((sentence) => ({
              id: assertGeneratedId(this.generateId),
              blockId,
              sentenceVersionId: sentence.sentenceVersionId,
              position: sentence.position,
              speaker: sentence.speaker,
            })),
          };
        }),
        options: source.options.map((option) => ({
          id: assertGeneratedId(this.generateId),
          questionVersionId: versionId,
          sentenceVersionId: option.sentenceVersionId,
          position: option.position,
          isCorrect: option.isCorrect,
          spanSentenceVersionId: option.spanSentenceVersionId,
          spanStartTokenIndex: option.spanStartTokenIndex,
          spanEndTokenIndex: option.spanEndTokenIndex,
        })),
      };
      await transaction.createVersion(graph);
      await transaction.appendAuditLog({
        actorSub: command.actorSub,
        actorUserId: command.actorUserId,
        action: 'QUESTION_VERSION_CLONED',
        targetType: 'QUESTION_VERSION',
        targetId: graph.version.id,
        summary: {
          questionId: question.id,
          sourceVersionId: source.id,
          version: graph.version.version,
        },
        requestId: command.requestId,
        occurredAt: command.occurredAt,
      });
      return toResult(graph.version);
    });
  }

  /** DRAFT만 current 참조로 검증한 새 sentence graph와 PENDING 상태로 교체한다 */
  async replaceVersion(
    command: ReplaceQuestionVersionCommand,
  ): Promise<QuestionAdminVersionResult> {
    assertQuestionInput(command.input);
    return this.repository.runInTransaction(async (transaction) => {
      const current = await transaction.loadVersionSource(command.versionId);
      if (!current) {
        throw new QuestionAdminError('QUESTION_VERSION_NOT_FOUND');
      }
      if (current.status !== 'DRAFT') {
        throw new QuestionAdminError('IMMUTABLE_VERSION');
      }
      const typeVersion = await transaction.findQuestionTypeVersion(
        command.input.questionTypeSlug,
        command.input.questionTypeVersion,
      );
      if (!typeVersion) {
        throw new QuestionAdminError(
          'QUESTION_TYPE_NOT_FOUND',
          'questionTypeSlug',
        );
      }

      const sentences: ResolvedQuestionSentenceGraph[] = [];
      const blocks = [];
      for (const [blockIndex, block] of command.input.blocks.entries()) {
        const blockId = assertGeneratedId(this.generateId);
        const blockSentences = [];
        for (const [sentenceIndex, entry] of block.sentences.entries()) {
          const sentence = await resolveSentence({
            transaction,
            sentence: entry.sentence,
            path: `blocks.${blockIndex}.sentences.${sentenceIndex}.sentence`,
            newId: () => assertGeneratedId(this.generateId),
          });
          sentences.push(sentence);
          blockSentences.push({
            id: assertGeneratedId(this.generateId),
            blockId,
            sentenceVersionId: sentence.version.id,
            position: sentenceIndex,
            speaker: entry.speaker ?? null,
          });
        }
        blocks.push({
          id: blockId,
          questionVersionId: current.id,
          kind: block.kind,
          displayMode: block.displayMode,
          position: blockIndex,
          sentences: blockSentences,
        });
      }

      const options = [];
      const spanKeys = new Set<string>();
      for (const [optionIndex, option] of command.input.options.entries()) {
        const sentence = await resolveSentence({
          transaction,
          sentence: option.sentence,
          path: `options.${optionIndex}.sentence`,
          newId: () => assertGeneratedId(this.generateId),
        });
        sentences.push(sentence);
        const targetBlock = option.span
          ? blocks[option.span.blockPosition]
          : undefined;
        const targetSentence = option.span
          ? targetBlock?.sentences[option.span.sentencePosition]
          : undefined;
        const targetGraph = targetSentence
          ? sentences.find(
              ({ version }) =>
                version.id === targetSentence.sentenceVersionId,
            )
          : undefined;
        const spanKey = option.span
          ? `${option.span.blockPosition}:${option.span.sentencePosition}:${option.span.startTokenIndex}:${option.span.endTokenIndex}`
          : null;
        if (
          option.span &&
          (!targetGraph ||
            option.span.endTokenIndex <= option.span.startTokenIndex ||
            option.span.startTokenIndex < 0 ||
            option.span.endTokenIndex > targetGraph.tokens.length ||
            spanKeys.has(spanKey!))
        ) {
          throw new QuestionAdminError(
            'QUESTION_CONTENT_INVALID',
            `options.${optionIndex}.span`,
          );
        }
        if (spanKey) spanKeys.add(spanKey);
        options.push({
          id: assertGeneratedId(this.generateId),
          questionVersionId: current.id,
          sentenceVersionId: sentence.version.id,
          position: option.position,
          isCorrect: option.clientRef === command.input.correctOptionRef,
          spanSentenceVersionId: targetSentence?.sentenceVersionId ?? null,
          spanStartTokenIndex: option.span?.startTokenIndex ?? null,
          spanEndTokenIndex: option.span?.endTokenIndex ?? null,
        });
      }

      const graph: QuestionAdminVersionGraph = {
        version: createDraftVersion({
          id: current.id,
          questionId: current.questionId,
          version: current.version,
          typeVersionId: typeVersion.id,
          difficulty: command.input.difficulty,
        }),
        sentences,
        blocks,
        options,
      };
      await transaction.replaceVersion(graph);
      await transaction.appendAuditLog({
        actorSub: command.actorSub,
        actorUserId: command.actorUserId,
        action: 'QUESTION_VERSION_REPLACED',
        targetType: 'QUESTION_VERSION',
        targetId: current.id,
        summary: { questionId: current.questionId, version: current.version },
        requestId: command.requestId,
        occurredAt: command.occurredAt,
      });
      return toResult(graph.version);
    });
  }
}

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
  if (!UUID_PATTERN.test(id)) {
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

const assertQuestionInput = (
  input: ReplaceQuestionVersionCommand['input'],
): void => {
  const optionRefs = input.options.map(({ clientRef }) => clientRef);
  if (
    input.questionTypeSlug.trim().length === 0 ||
    !Number.isSafeInteger(input.questionTypeVersion) ||
    input.questionTypeVersion < 1 ||
    !Number.isSafeInteger(input.difficulty) ||
    input.difficulty < 1 ||
    input.difficulty > 5 ||
    input.blocks.length === 0 ||
    input.blocks.some(({ sentences }) => sentences.length === 0) ||
    input.options.length === 0
  ) {
    throw new QuestionAdminError('QUESTION_CONTENT_INVALID', 'question');
  }
  if (
    optionRefs.some((ref) => ref.length === 0) ||
    new Set(optionRefs).size !== optionRefs.length ||
    !optionRefs.includes(input.correctOptionRef)
  ) {
    throw new QuestionAdminError(
      'QUESTION_CONTENT_INVALID',
      'correctOptionRef',
    );
  }
  input.options.forEach((option, index) => {
    if (option.position !== index) {
      throw new QuestionAdminError(
        'QUESTION_CONTENT_INVALID',
        `options.${index}.position`,
      );
    }
  });
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
    !UUID_PATTERN.test(reference.id)
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
    expressionCandidates.push({
      startTokenIndex: expression.startTokenIndex,
      endTokenIndex: expression.endTokenIndex,
      vocabularyId: vocabulary.id,
      vocabularyKind: vocabulary.kind,
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
        })),
      };
      await transaction.createVersion(graph);
      await transaction.appendAuditLog({
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
    return this.repository.runInTransaction(async (transaction) => {
      const current = await transaction.loadVersionSource(command.versionId);
      if (!current) {
        throw new QuestionAdminError('QUESTION_VERSION_NOT_FOUND');
      }
      if (current.status !== 'DRAFT') {
        throw new QuestionAdminError('IMMUTABLE_VERSION');
      }
      assertQuestionInput(command.input);
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
      for (const [optionIndex, option] of command.input.options.entries()) {
        const sentence = await resolveSentence({
          transaction,
          sentence: option.sentence,
          path: `options.${optionIndex}.sentence`,
          newId: () => assertGeneratedId(this.generateId),
        });
        sentences.push(sentence);
        options.push({
          id: assertGeneratedId(this.generateId),
          questionVersionId: current.id,
          sentenceVersionId: sentence.version.id,
          position: option.position,
          isCorrect: option.clientRef === command.input.correctOptionRef,
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

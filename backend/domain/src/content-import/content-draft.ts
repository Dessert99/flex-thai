/** canonical 입력을 current 참조로 해석해 어휘·문제 초안을 원자 저장한다 */
import { randomUUID } from 'node:crypto';
import { assertMediaAssetReady } from '../media/media-asset.js';
import {
  resolveRepresentativeExpressions,
  validateThaiSentenceVersion,
  type ThaiExpressionOccurrenceInput,
  type ThaiSentenceVersionInput,
} from '../thai-content/thai-sentence-version.js';
import {
  createVocabularyDraft,
  VocabularyDomainError,
} from '../vocabulary/vocabulary.js';
import type {
  ContentDraftRepository,
  ContentDraftTransaction,
  ImportedVocabularyReferenceItem,
  ResolvedContentDraftAudit,
  ResolvedContentImportItem,
  ResolvedQuestionDraftGraph,
  ResolvedQuestionSentenceGraph,
  ResolvedVocabularyDraftGraph,
  VocabularyMeaningReferenceRecord,
  VocabularyPronunciationReferenceRecord,
  VocabularyReferenceRecord,
} from './content-draft.repository.js';
import type {
  CanonicalDraftQuestionInput,
  CanonicalDraftSentenceInput,
  CanonicalDraftVocabularyInput,
  ContentDraftAuditContext,
  ContentDraftItemResult,
  ContentDraftReference,
} from './content-import.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** 콘텐츠 초안 생성 실패를 호출자가 항목 오류로 저장할 stable code로 전달한다 */
export class ContentDraftError extends Error {
  constructor(
    readonly code:
      | 'IMPORT_REFERENCE_NOT_FOUND'
      | 'IMPORT_REFERENCE_MISMATCH'
      | 'IMPORT_MEDIA_NOT_READY'
      | 'IMPORT_QUESTION_TYPE_NOT_FOUND'
      | 'IMPORT_DUPLICATE_VOCABULARY'
      | 'IMPORT_CONTENT_INVALID',
    readonly path: string,
  ) {
    super(code);
    this.name = 'ContentDraftError';
  }
}

/** vocabulary import item 하나의 위치·입력·audit 문맥 */
export interface CreateVocabularyDraftCommand {
  importId: string;
  sourceIndex: number;
  input: CanonicalDraftVocabularyInput;
  context: ContentDraftAuditContext;
}

/** question import item 하나의 위치·입력·audit 문맥 */
export interface CreateQuestionDraftCommand {
  importId: string;
  sourceIndex: number;
  input: CanonicalDraftQuestionInput;
  context: ContentDraftAuditContext;
}

interface ResolvedReference<T> {
  record: T;
  importedItem: ImportedVocabularyReferenceItem | null;
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const assertNonnegativeSourceIndex = (sourceIndex: number): void => {
  if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'sourceIndex');
  }
};

const assertUniqueNonemptyRefs = (
  refs: readonly string[],
  path: string,
): void => {
  if (
    refs.some((ref) => ref.length === 0) ||
    new Set(refs).size !== refs.length
  ) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', path);
  }
};

const createIdFactory = (generateId: () => string) => (): string => {
  const id = generateId();
  if (!UUID_PATTERN.test(id)) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'generatedId');
  }
  return id;
};

const createItem = (input: {
  id: string;
  importId: string;
  kind: ResolvedContentImportItem['kind'];
  sourceIndex: number;
  clientRef: string;
  targetId: string;
  referenceMap: Record<string, string>;
}): ResolvedContentImportItem => ({
  ...input,
  status: 'IMPORTED',
  errors: [],
});

const createAudit = (
  context: ContentDraftAuditContext,
  input: {
    action: ResolvedContentDraftAudit['action'];
    targetType: ResolvedContentDraftAudit['targetType'];
    targetId: string;
    importId: string;
    sourceIndex: number;
  },
): ResolvedContentDraftAudit => ({
  ...context,
  action: input.action,
  targetType: input.targetType,
  targetId: input.targetId,
  summary: {
    importId: input.importId,
    sourceIndex: input.sourceIndex,
  },
});

const assertVocabularyInput = (input: CanonicalDraftVocabularyInput): void => {
  if (input.meanings.length === 0 || input.pronunciations.length === 0) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'meanings');
  }
  assertUniqueNonemptyRefs(
    [
      input.clientRef,
      ...input.meanings.map(({ clientRef }) => clientRef),
      ...input.pronunciations.map(({ clientRef }) => clientRef),
    ],
    'meanings',
  );
};

const assertQuestionInput = (input: CanonicalDraftQuestionInput): void => {
  if (
    !Number.isSafeInteger(input.questionTypeVersion) ||
    input.questionTypeVersion < 1 ||
    !Number.isSafeInteger(input.difficulty) ||
    input.difficulty < 1 ||
    input.difficulty > 5 ||
    input.blocks.length === 0 ||
    input.options.length === 0
  ) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'question');
  }
  const optionRefs = input.options.map(({ clientRef }) => clientRef);
  const tagSlugs = input.tagSlugs ?? [];
  if (
    !(input.topicSlug ?? 'general').trim() ||
    new Set(tagSlugs).size !== tagSlugs.length ||
    tagSlugs.some((slug) => !slug.trim())
  ) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'taxonomy');
  }
  assertUniqueNonemptyRefs([input.clientRef, ...optionRefs], 'options');
  input.options.forEach((option, index) => {
    if (option.position !== index) {
      throw new ContentDraftError(
        'IMPORT_CONTENT_INVALID',
        `options.${index}.position`,
      );
    }
  });
  if (!optionRefs.includes(input.correctOptionRef)) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'correctOptionRef');
  }
};

const assertExactReference = (
  reference: ContentDraftReference,
  path: string,
): { kind: 'ID' | 'CLIENT_REF'; value: string } => {
  const hasId = hasOwn(reference, 'id');
  const hasClientRef = hasOwn(reference, 'clientRef');
  if (hasId === hasClientRef) {
    throw new ContentDraftError('IMPORT_REFERENCE_MISMATCH', path);
  }
  const value = hasId ? reference.id : reference.clientRef;
  if (typeof value !== 'string' || value.length === 0) {
    throw new ContentDraftError('IMPORT_REFERENCE_MISMATCH', path);
  }
  if (hasId && !UUID_PATTERN.test(value)) {
    throw new ContentDraftError('IMPORT_REFERENCE_MISMATCH', path);
  }
  return {
    kind: hasId ? 'ID' : 'CLIENT_REF',
    value,
  };
};

class CurrentReferenceResolver {
  private readonly importedItems = new Map<
    string,
    ImportedVocabularyReferenceItem
  >();
  private readonly vocabularies = new Map<string, VocabularyReferenceRecord>();
  private readonly meanings = new Map<
    string,
    VocabularyMeaningReferenceRecord
  >();
  private readonly pronunciations = new Map<
    string,
    VocabularyPronunciationReferenceRecord
  >();

  constructor(
    private readonly transaction: ContentDraftTransaction,
    private readonly importId: string,
  ) {}

  private async resolveId(
    reference: ContentDraftReference,
    path: string,
  ): Promise<{
    id: string;
    importedItem: ImportedVocabularyReferenceItem | null;
  }> {
    const exact = assertExactReference(reference, path);
    if (exact.kind === 'ID') {
      return { id: exact.value, importedItem: null };
    }
    const cached = this.importedItems.get(exact.value);
    if (cached) {
      return {
        id: cached.referenceMap[exact.value]!,
        importedItem: cached,
      };
    }
    const items =
      await this.transaction.findSuccessfulVocabularyImportItemsByReference(
        this.importId,
        exact.value,
      );
    if (items.length === 0) {
      throw new ContentDraftError('IMPORT_REFERENCE_NOT_FOUND', path);
    }
    if (items.length !== 1) {
      throw new ContentDraftError('IMPORT_REFERENCE_MISMATCH', path);
    }
    const item = items[0]!;
    const id = item.referenceMap[exact.value];
    if (
      typeof id !== 'string' ||
      !UUID_PATTERN.test(id) ||
      item.targetId !== item.referenceMap[item.clientRef]
    ) {
      throw new ContentDraftError('IMPORT_REFERENCE_MISMATCH', path);
    }
    this.importedItems.set(exact.value, item);
    return { id, importedItem: item };
  }

  /** vocabulary 참조를 성공 item map 또는 current UUID row로 해석한다 */
  async vocabulary(
    reference: ContentDraftReference,
    path: string,
  ): Promise<ResolvedReference<VocabularyReferenceRecord>> {
    const resolved = await this.resolveId(reference, path);
    let record = this.vocabularies.get(resolved.id);
    if (!record) {
      record =
        (await this.transaction.findVocabularyById(resolved.id)) ?? undefined;
      if (!record) {
        throw new ContentDraftError('IMPORT_REFERENCE_NOT_FOUND', path);
      }
      this.vocabularies.set(record.id, record);
    }
    return { record, importedItem: resolved.importedItem };
  }

  /** meaning 참조를 성공 item map 또는 current UUID row로 해석한다 */
  async meaning(
    reference: ContentDraftReference,
    path: string,
  ): Promise<ResolvedReference<VocabularyMeaningReferenceRecord>> {
    const resolved = await this.resolveId(reference, path);
    let record = this.meanings.get(resolved.id);
    if (!record) {
      record =
        (await this.transaction.findVocabularyMeaningById(resolved.id)) ??
        undefined;
      if (!record) {
        throw new ContentDraftError('IMPORT_REFERENCE_NOT_FOUND', path);
      }
      this.meanings.set(record.id, record);
    }
    return { record, importedItem: resolved.importedItem };
  }

  /** pronunciation 참조를 성공 item map 또는 current UUID row로 해석한다 */
  async pronunciation(
    reference: ContentDraftReference,
    path: string,
  ): Promise<ResolvedReference<VocabularyPronunciationReferenceRecord>> {
    const resolved = await this.resolveId(reference, path);
    let record = this.pronunciations.get(resolved.id);
    if (!record) {
      record =
        (await this.transaction.findVocabularyPronunciationById(resolved.id)) ??
        undefined;
      if (!record) {
        throw new ContentDraftError('IMPORT_REFERENCE_NOT_FOUND', path);
      }
      this.pronunciations.set(record.id, record);
    }
    return { record, importedItem: resolved.importedItem };
  }
}

const assertSameVocabulary = (
  vocabulary: ResolvedReference<VocabularyReferenceRecord>,
  meaning: ResolvedReference<VocabularyMeaningReferenceRecord>,
  pronunciation: ResolvedReference<VocabularyPronunciationReferenceRecord>,
  path: string,
): void => {
  if (meaning.record.vocabularyId !== vocabulary.record.id) {
    throw new ContentDraftError('IMPORT_REFERENCE_MISMATCH', `${path}.meaning`);
  }
  if (pronunciation.record.vocabularyId !== vocabulary.record.id) {
    throw new ContentDraftError(
      'IMPORT_REFERENCE_MISMATCH',
      `${path}.pronunciation`,
    );
  }
  const imported = [
    vocabulary.importedItem,
    meaning.importedItem,
    pronunciation.importedItem,
  ].filter((item): item is ImportedVocabularyReferenceItem => item !== null);
  if (
    new Set(imported.map(({ itemId }) => itemId)).size > 1 ||
    imported.some(({ targetId }) => targetId !== vocabulary.record.id)
  ) {
    throw new ContentDraftError('IMPORT_REFERENCE_MISMATCH', path);
  }
};

const resolveSentence = async (input: {
  transaction: ContentDraftTransaction;
  resolver: CurrentReferenceResolver;
  sentence: CanonicalDraftSentenceInput;
  path: string;
  newId: () => string;
}): Promise<ResolvedQuestionSentenceGraph> => {
  const mediaAsset = await input.transaction.findMediaAssetById(
    input.sentence.mediaAssetId,
  );
  if (!mediaAsset) {
    throw new ContentDraftError(
      'IMPORT_REFERENCE_NOT_FOUND',
      `${input.path}.mediaAssetId`,
    );
  }
  try {
    assertMediaAssetReady(mediaAsset);
  } catch {
    throw new ContentDraftError(
      'IMPORT_MEDIA_NOT_READY',
      `${input.path}.mediaAssetId`,
    );
  }

  const sentenceId = input.newId();
  const sentenceVersionId = input.newId();
  const tokens = [];
  for (const [index, token] of input.sentence.tokens.entries()) {
    const tokenPath = `${input.path}.tokens.${index}`;
    const vocabulary = await input.resolver.vocabulary(
      token.vocabulary,
      `${tokenPath}.vocabulary`,
    );
    const meaning = await input.resolver.meaning(
      token.meaning,
      `${tokenPath}.meaning`,
    );
    const pronunciation = await input.resolver.pronunciation(
      token.pronunciation,
      `${tokenPath}.pronunciation`,
    );
    assertSameVocabulary(vocabulary, meaning, pronunciation, tokenPath);
    tokens.push({
      id: input.newId(),
      sentenceVersionId,
      position: index,
      surface: token.surface,
      startOffset: token.startOffset,
      endOffset: token.endOffset,
      vocabularyId: vocabulary.record.id,
      meaningId: meaning.record.id,
      pronunciationId: pronunciation.record.id,
      contextMeaningKo: token.contextMeaningKo,
      role: token.role,
    });
  }

  const expressionCandidates: ThaiExpressionOccurrenceInput[] = [];
  for (const [index, expression] of input.sentence.expressions.entries()) {
    const expressionPath = `${input.path}.expressions.${index}`;
    const vocabulary = await input.resolver.vocabulary(
      expression.vocabulary,
      `${expressionPath}.vocabulary`,
    );
    if (vocabulary.record.kind !== 'EXPRESSION') {
      throw new ContentDraftError(
        'IMPORT_REFERENCE_MISMATCH',
        `${expressionPath}.vocabulary`,
      );
    }
    const meaning = await input.resolver.meaning(
      expression.meaning,
      `${expressionPath}.meaning`,
    );
    const pronunciation = await input.resolver.pronunciation(
      expression.pronunciation,
      `${expressionPath}.pronunciation`,
    );
    assertSameVocabulary(vocabulary, meaning, pronunciation, expressionPath);
    expressionCandidates.push({
      startTokenIndex: expression.startTokenIndex,
      endTokenIndex: expression.endTokenIndex,
      vocabularyId: vocabulary.record.id,
      vocabularyKind: vocabulary.record.kind,
      meaningId: meaning.record.id,
      pronunciationId: pronunciation.record.id,
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
    throw new ContentDraftError(
      'IMPORT_CONTENT_INVALID',
      `${input.path}.${issue.path}`,
    );
  }

  const expressions = resolveRepresentativeExpressions(
    expressionCandidates,
  ).map((expression) => ({
    startTokenIndex: expression.startTokenIndex,
    endTokenIndex: expression.endTokenIndex,
    vocabularyId: expression.vocabularyId,
    vocabularyKind: expression.vocabularyKind,
    meaningId: expression.meaningId,
    pronunciationId: expression.pronunciationId,
    contextMeaningKo: expression.contextMeaningKo,
    representative: expression.representative,
    id: input.newId(),
    sentenceVersionId,
  }));
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
    expressions,
  };
};

/** 어휘와 문제 import item을 독립 transaction으로 canonical DRAFT에 저장한다 */
export class ContentDraftService {
  private readonly newId: () => string;

  constructor(
    private readonly repository: ContentDraftRepository,
    generateId: () => string = randomUUID,
  ) {
    this.newId = createIdFactory(generateId);
  }

  /** 어휘 정규화·media 존재·all-to-all mapping을 검증해 한 item으로 저장한다 */
  async createVocabularyItem(
    command: CreateVocabularyDraftCommand,
  ): Promise<ContentDraftItemResult> {
    assertNonnegativeSourceIndex(command.sourceIndex);
    assertVocabularyInput(command.input);
    const vocabularyId = this.newId();
    let vocabulary;
    try {
      vocabulary = createVocabularyDraft({
        id: vocabularyId,
        thai: command.input.thai,
        kind: command.input.kind,
      });
    } catch (error) {
      if (error instanceof VocabularyDomainError) {
        throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'thai');
      }
      throw error;
    }

    return this.repository.runInTransaction(async (transaction) => {
      if (
        await transaction.findVocabularyByNormalizedThai(
          vocabulary.normalizedThai,
        )
      ) {
        throw new ContentDraftError('IMPORT_DUPLICATE_VOCABULARY', 'thai');
      }
      for (const [
        index,
        pronunciation,
      ] of command.input.pronunciations.entries()) {
        if (
          !(await transaction.findMediaAssetById(pronunciation.mediaAssetId))
        ) {
          throw new ContentDraftError(
            'IMPORT_REFERENCE_NOT_FOUND',
            `pronunciations.${index}.mediaAssetId`,
          );
        }
      }

      const meanings = command.input.meanings.map((meaning) => ({
        id: this.newId(),
        vocabularyId,
        meaningKo: meaning.meaningKo,
        partOfSpeech: meaning.partOfSpeech,
        difficulty: meaning.difficulty ?? null,
        contextNote: meaning.contextNote ?? null,
      }));
      const pronunciations = command.input.pronunciations.map(
        (pronunciation) => ({
          id: this.newId(),
          vocabularyId,
          pronunciationKo: pronunciation.pronunciationKo,
          toneMarks: pronunciation.toneMarks,
          mediaAssetId: pronunciation.mediaAssetId,
        }),
      );
      const graph: ResolvedVocabularyDraftGraph = {
        vocabulary,
        meanings,
        pronunciations,
        meaningPronunciations: meanings.flatMap((meaning) =>
          pronunciations.map((pronunciation) => ({
            vocabularyId,
            meaningId: meaning.id,
            pronunciationId: pronunciation.id,
          })),
        ),
      };
      // Object.fromEntries는 __proto__도 setter가 아닌 own data property로 만든다.
      const referenceMap = Object.fromEntries([
        [command.input.clientRef, vocabularyId],
        ...command.input.meanings.map(
          (meaning, index) => [meaning.clientRef, meanings[index]!.id] as const,
        ),
        ...command.input.pronunciations.map(
          (pronunciation, index) =>
            [pronunciation.clientRef, pronunciations[index]!.id] as const,
        ),
      ]);
      await transaction.saveVocabularyDraft({
        graph,
        item: createItem({
          id: this.newId(),
          importId: command.importId,
          kind: 'VOCABULARY',
          sourceIndex: command.sourceIndex,
          clientRef: command.input.clientRef,
          targetId: vocabularyId,
          referenceMap,
        }),
        audit: createAudit(command.context, {
          action: 'CONTENT_VOCABULARY_DRAFT_IMPORTED',
          targetType: 'VOCABULARY',
          targetId: vocabularyId,
          importId: command.importId,
          sourceIndex: command.sourceIndex,
        }),
      });
      return { targetId: vocabularyId, referenceMap };
    });
  }

  /** current 참조와 Thai 범위를 해석해 question/version 1 DRAFT를 저장한다 */
  async createQuestionItem(
    command: CreateQuestionDraftCommand,
  ): Promise<ContentDraftItemResult> {
    assertNonnegativeSourceIndex(command.sourceIndex);
    assertQuestionInput(command.input);
    return this.repository.runInTransaction(async (transaction) => {
      const typeVersion = await transaction.findQuestionTypeVersion(
        command.input.questionTypeSlug,
        command.input.questionTypeVersion,
      );
      if (
        !typeVersion ||
        typeVersion.slug !== command.input.questionTypeSlug ||
        typeVersion.version !== command.input.questionTypeVersion
      ) {
        throw new ContentDraftError(
          'IMPORT_QUESTION_TYPE_NOT_FOUND',
          'questionTypeSlug',
        );
      }
      const topicSlug = command.input.topicSlug ?? 'general';
      const tagSlugs = command.input.tagSlugs ?? [];
      const topic = await transaction.findActiveQuestionTopic(topicSlug);
      const tags = await transaction.findActiveQuestionTags(tagSlugs);
      if (!topic || tags.length !== tagSlugs.length) {
        throw new ContentDraftError(
          'IMPORT_QUESTION_TYPE_NOT_FOUND',
          'taxonomy',
        );
      }

      const resolver = new CurrentReferenceResolver(
        transaction,
        command.importId,
      );
      const questionId = this.newId();
      const questionVersionId = this.newId();
      const sentences: ResolvedQuestionSentenceGraph[] = [];
      const blocks = [];
      for (const [blockIndex, block] of command.input.blocks.entries()) {
        const blockId = this.newId();
        const blockSentences = [];
        for (const [sentenceIndex, entry] of block.sentences.entries()) {
          const sentence = await resolveSentence({
            transaction,
            resolver,
            sentence: entry.sentence,
            path: `blocks.${blockIndex}.sentences.${sentenceIndex}.sentence`,
            newId: this.newId,
          });
          sentences.push(sentence);
          blockSentences.push({
            id: this.newId(),
            blockId,
            sentenceVersionId: sentence.version.id,
            position: sentenceIndex,
            speaker: entry.speaker ?? null,
          });
        }
        blocks.push({
          id: blockId,
          questionVersionId,
          kind: block.kind,
          displayMode: block.displayMode,
          position: blockIndex,
          sentences: blockSentences,
        });
      }

      const options = [];
      const spanKeys = new Set<string>();
      const referenceEntries: Array<readonly [string, string]> = [
        [command.input.clientRef, questionId],
      ];
      for (const [optionIndex, option] of command.input.options.entries()) {
        const inline = typeVersion.template === 'INLINE_SPAN_CHOICE';
        if (inline !== (option.sentence === null)) {
          throw new ContentDraftError(
            'IMPORT_CONTENT_INVALID',
            `options.${optionIndex}`,
          );
        }
        const sentence =
          option.sentence === null
            ? null
            : await resolveSentence({
                transaction,
                resolver,
                sentence: option.sentence,
                path: `options.${optionIndex}.sentence`,
                newId: this.newId,
              });
        if (sentence !== null) {
          sentences.push(sentence);
        }
        const optionId = this.newId();
        const targetBlock = option.span
          ? blocks[option.span.blockPosition]
          : undefined;
        const targetSentence = option.span
          ? targetBlock?.sentences[option.span.sentencePosition]
          : undefined;
        const targetGraph = targetSentence
          ? sentences.find(
              ({ version }) => version.id === targetSentence.sentenceVersionId,
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
          throw new ContentDraftError(
            'IMPORT_CONTENT_INVALID',
            `options.${optionIndex}.span`,
          );
        }
        if (spanKey) spanKeys.add(spanKey);
        options.push({
          id: optionId,
          questionVersionId,
          sentenceVersionId: sentence?.version.id ?? null,
          position: option.position,
          isCorrect: option.clientRef === command.input.correctOptionRef,
          spanSentenceVersionId: targetSentence?.sentenceVersionId ?? null,
          spanStartTokenIndex: option.span?.startTokenIndex ?? null,
          spanEndTokenIndex: option.span?.endTokenIndex ?? null,
        });
        referenceEntries.push([option.clientRef, optionId]);
      }
      // option의 prototype-like ref도 JSON object의 own key로 직렬화한다.
      const referenceMap = Object.fromEntries(referenceEntries);

      const graph: ResolvedQuestionDraftGraph = {
        question: {
          id: questionId,
          status: 'DRAFT',
          currentPublishedVersionId: null,
        },
        version: {
          id: questionVersionId,
          questionId,
          version: 1,
          typeVersionId: typeVersion.id,
          topicId: topic.id,
          difficulty: command.input.difficulty,
          status: 'DRAFT',
          validationStatus: 'PENDING',
          validationIssues: [],
          validatedAt: null,
          publishedAt: null,
        },
        tagIds: tags.map(({ id }) => id),
        sentences,
        blocks,
        options,
      };
      await transaction.saveQuestionDraft({
        graph,
        item: createItem({
          id: this.newId(),
          importId: command.importId,
          kind: 'QUESTION',
          sourceIndex: command.sourceIndex,
          clientRef: command.input.clientRef,
          targetId: questionId,
          referenceMap,
        }),
        audit: createAudit(command.context, {
          action: 'CONTENT_QUESTION_DRAFT_IMPORTED',
          targetType: 'QUESTION',
          targetId: questionId,
          importId: command.importId,
          sourceIndex: command.sourceIndex,
        }),
      });
      return { targetId: questionId, referenceMap };
    });
  }
}

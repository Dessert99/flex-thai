/** AI 후보의 canonical graph를 nullable-audio 문제 DRAFT로 저장한다 */
import { randomUUID } from 'node:crypto';
import {
  assertGeneratedDraftSentenceInput,
  type ContentDraftReference,
  type GeneratedDraftSentenceInput,
  QuestionAdminError,
  QuestionCandidateReviewError,
  resolveRepresentativeExpressions,
  validateGeneratedQuestionSchema,
  validateThaiSentenceVersion,
  type ThaiExpressionOccurrenceInput,
  type ThaiTokenOccurrenceInput,
} from '@flex-thia/domain';
import { and, eq, inArray } from 'drizzle-orm';
import {
  expressionOccurrences,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questionTags,
  questionTopics,
  questions,
  questionTypes,
  questionTypeVersions,
  questionVersions,
  questionVersionTags,
  thaiSentences,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../../schema/index.js';
import type {
  GeneratedQuestionDraftWriter,
  QuestionProductionTransaction,
} from './drizzle-ai-question-production.repository.js';

type DraftInput = Parameters<GeneratedQuestionDraftWriter['createDraft']>[1];
type CandidatePayload = DraftInput['candidate']['payload'];
type GeneratedSentence =
  CandidatePayload['blocks'][number]['sentences'][number]['sentence'];

type VocabularyRecord = {
  id: string;
  kind: 'WORD' | 'EXPRESSION';
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'MERGED';
};
type MeaningRecord = { id: string; vocabularyId: string };
type PronunciationRecord = { id: string; vocabularyId: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const notApprovable = (): never => {
  throw new QuestionCandidateReviewError('QUESTION_CANDIDATE_NOT_APPROVABLE');
};

const hasExactKeys = (value: object, keys: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
};

const requireReferenceId = (reference: ContentDraftReference): string => {
  if (
    !hasExactKeys(reference, ['id']) ||
    !('id' in reference) ||
    typeof reference.id !== 'string' ||
    !UUID_PATTERN.test(reference.id)
  ) {
    return notApprovable();
  }
  return reference.id;
};

const comparePosition = (
  left: { position: number },
  right: { position: number },
): number => left.position - right.position;

const assertCandidatePayload = (input: DraftInput): void => {
  const { candidate } = input;
  const { payload } = candidate;
  const schema = validateGeneratedQuestionSchema({
    questionTypeVersionId: candidate.typeVersionId,
    topicId: candidate.topicId,
    tagIds: [],
    difficulty: candidate.difficulty,
    payload,
  });
  if (
    schema.status !== 'PASSED' ||
    !hasExactKeys(payload, [
      'questionTypeSlug',
      'questionTypeVersion',
      'difficulty',
      'topicSlug',
      'tagSlugs',
      'blocks',
      'options',
      'correctOptionRef',
    ]) ||
    typeof payload.questionTypeSlug !== 'string' ||
    payload.questionTypeSlug.length === 0 ||
    !Number.isSafeInteger(payload.questionTypeVersion) ||
    payload.questionTypeVersion < 1 ||
    payload.difficulty !== candidate.difficulty ||
    typeof payload.topicSlug !== 'string' ||
    payload.topicSlug.length === 0 ||
    payload.blocks.length === 0 ||
    payload.blocks.some(({ sentences }) => sentences.length === 0) ||
    payload.options.length === 0 ||
    new Set(payload.tagSlugs).size !== payload.tagSlugs.length ||
    payload.tagSlugs.some(
      (slug) => typeof slug !== 'string' || slug.length === 0,
    )
  ) {
    notApprovable();
  }

  const optionRefs = payload.options.map(({ clientRef }) => clientRef);
  if (
    payload.options.some(
      (option, index) =>
        !hasExactKeys(option, ['clientRef', 'position', 'sentence', 'span']) ||
        option.clientRef.length === 0 ||
        option.position !== index,
    ) ||
    new Set(optionRefs).size !== optionRefs.length ||
    !optionRefs.includes(payload.correctOptionRef)
  ) {
    notApprovable();
  }
};

const generatedSentences = (payload: CandidatePayload): GeneratedSentence[] => [
  ...payload.blocks.flatMap((block) =>
    block.sentences.map(({ sentence }) => sentence),
  ),
  ...payload.options.flatMap(({ sentence }) =>
    sentence === null ? [] : [sentence],
  ),
];

const nullableSentence = (
  sentence: GeneratedSentence,
  path: string,
): GeneratedDraftSentenceInput => {
  const value = { ...sentence, mediaAssetId: null };
  try {
    assertGeneratedDraftSentenceInput(value, path);
  } catch (error) {
    if (error instanceof QuestionAdminError) notApprovable();
    throw error;
  }
  return value;
};

const referenceIds = (sentences: GeneratedDraftSentenceInput[]) => {
  const vocabularyIds = new Set<string>();
  const meaningIds = new Set<string>();
  const pronunciationIds = new Set<string>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      vocabularyIds.add(requireReferenceId(token.vocabulary));
      meaningIds.add(requireReferenceId(token.meaning));
      pronunciationIds.add(requireReferenceId(token.pronunciation));
    }
    for (const expression of sentence.expressions) {
      vocabularyIds.add(requireReferenceId(expression.vocabulary));
      meaningIds.add(requireReferenceId(expression.meaning));
      pronunciationIds.add(requireReferenceId(expression.pronunciation));
    }
  }
  return {
    vocabularyIds: [...vocabularyIds],
    meaningIds: [...meaningIds],
    pronunciationIds: [...pronunciationIds],
  };
};

const loadCanonicalReferences = async (
  transaction: QuestionProductionTransaction,
  sentences: GeneratedDraftSentenceInput[],
) => {
  const ids = referenceIds(sentences);
  const vocabularyRows =
    ids.vocabularyIds.length === 0
      ? []
      : await transaction
          .select({
            id: vocabularies.id,
            kind: vocabularies.kind,
            status: vocabularies.status,
          })
          .from(vocabularies)
          .where(inArray(vocabularies.id, ids.vocabularyIds))
          .for('key share');
  const meaningRows =
    ids.meaningIds.length === 0
      ? []
      : await transaction
          .select({
            id: vocabularyMeanings.id,
            vocabularyId: vocabularyMeanings.vocabularyId,
          })
          .from(vocabularyMeanings)
          .where(inArray(vocabularyMeanings.id, ids.meaningIds))
          .for('key share');
  const pronunciationRows =
    ids.pronunciationIds.length === 0
      ? []
      : await transaction
          .select({
            id: vocabularyPronunciations.id,
            vocabularyId: vocabularyPronunciations.vocabularyId,
          })
          .from(vocabularyPronunciations)
          .where(inArray(vocabularyPronunciations.id, ids.pronunciationIds))
          .for('key share');

  if (
    vocabularyRows.length !== ids.vocabularyIds.length ||
    meaningRows.length !== ids.meaningIds.length ||
    pronunciationRows.length !== ids.pronunciationIds.length
  ) {
    notApprovable();
  }
  const vocabularyById = new Map(
    (vocabularyRows as VocabularyRecord[]).map((record) => [record.id, record]),
  );
  const meaningById = new Map(
    (meaningRows as MeaningRecord[]).map((record) => [record.id, record]),
  );
  const pronunciationById = new Map(
    (pronunciationRows as PronunciationRecord[]).map((record) => [
      record.id,
      record,
    ]),
  );
  if ([...vocabularyById.values()].some(({ status }) => status === 'MERGED')) {
    notApprovable();
  }
  return { meaningById, pronunciationById, vocabularyById };
};

type CanonicalReferences = Awaited<ReturnType<typeof loadCanonicalReferences>>;

const resolveSentence = (input: {
  sentence: GeneratedDraftSentenceInput;
  references: CanonicalReferences;
  newId: () => string;
}) => {
  const sentenceId = input.newId();
  const sentenceVersionId = input.newId();
  const tokens: Array<
    ThaiTokenOccurrenceInput & { id: string; sentenceVersionId: string }
  > = input.sentence.tokens.map((token, position) => {
    const vocabularyId = requireReferenceId(token.vocabulary);
    const meaningId = requireReferenceId(token.meaning);
    const pronunciationId = requireReferenceId(token.pronunciation);
    const vocabulary = input.references.vocabularyById.get(vocabularyId);
    const meaning = input.references.meaningById.get(meaningId);
    const pronunciation =
      input.references.pronunciationById.get(pronunciationId);
    if (
      !vocabulary ||
      meaning?.vocabularyId !== vocabulary.id ||
      pronunciation?.vocabularyId !== vocabulary.id
    ) {
      return notApprovable();
    }
    return {
      id: input.newId(),
      sentenceVersionId,
      position,
      surface: token.surface,
      startOffset: token.startOffset,
      endOffset: token.endOffset,
      vocabularyId,
      meaningId,
      pronunciationId,
      contextMeaningKo: token.contextMeaningKo,
      role: token.role,
    };
  });
  const expressionCandidates: ThaiExpressionOccurrenceInput[] =
    input.sentence.expressions.map((expression) => {
      const vocabularyId = requireReferenceId(expression.vocabulary);
      const meaningId = requireReferenceId(expression.meaning);
      const pronunciationId = requireReferenceId(expression.pronunciation);
      const vocabulary = input.references.vocabularyById.get(vocabularyId);
      const meaning = input.references.meaningById.get(meaningId);
      const pronunciation =
        input.references.pronunciationById.get(pronunciationId);
      if (
        vocabulary?.kind !== 'EXPRESSION' ||
        meaning?.vocabularyId !== vocabulary.id ||
        pronunciation?.vocabularyId !== vocabulary.id
      ) {
        return notApprovable();
      }
      return {
        startTokenIndex: expression.startTokenIndex,
        endTokenIndex: expression.endTokenIndex,
        vocabularyId,
        vocabularyKind: vocabulary.kind,
        meaningId,
        pronunciationId,
        contextMeaningKo: expression.contextMeaningKo,
        adminSelected: expression.representative ?? false,
      };
    });
  const issue = validateThaiSentenceVersion({
    ...input.sentence,
    tokens,
    expressions: expressionCandidates,
  })[0];
  if (issue) notApprovable();

  return {
    sentence: { id: sentenceId },
    version: {
      id: sentenceVersionId,
      sentenceId,
      version: 1 as const,
      originalText: input.sentence.originalText,
      translationKo: input.sentence.translationKo,
      pronunciationKo: input.sentence.pronunciationKo,
      toneMarks: input.sentence.toneMarks,
      mediaAssetId: null,
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

type ResolvedSentence = ReturnType<typeof resolveSentence>;

const insertGraph = async (
  transaction: QuestionProductionTransaction,
  graph: ReturnType<typeof createGraph>,
): Promise<void> => {
  await transaction.insert(questions).values(graph.question);
  await transaction.insert(questionVersions).values(graph.version);
  if (graph.tagIds.length > 0) {
    await transaction.insert(questionVersionTags).values(
      graph.tagIds.map((tagId) => ({
        questionVersionId: graph.version.id,
        tagId,
      })),
    );
  }
  await transaction
    .insert(thaiSentences)
    .values(graph.sentences.map(({ sentence }) => sentence));
  await transaction
    .insert(thaiSentenceVersions)
    .values(graph.sentences.map(({ version }) => version));
  const tokens = graph.sentences.flatMap(({ tokens: rows }) =>
    [...rows].sort(comparePosition),
  );
  if (tokens.length > 0) {
    await transaction.insert(tokenOccurrences).values(tokens);
  }
  const expressions = graph.sentences.flatMap(({ expressions: rows }) => rows);
  if (expressions.length > 0) {
    await transaction.insert(expressionOccurrences).values(expressions);
  }
  await transaction
    .insert(questionBlocks)
    .values([...graph.blocks].sort(comparePosition));
  const blockSentences = graph.blocks.flatMap(({ sentences }) =>
    [...sentences].sort(comparePosition),
  );
  if (blockSentences.length > 0) {
    await transaction.insert(questionBlockSentences).values(blockSentences);
  }
  await transaction
    .insert(questionOptions)
    .values([...graph.options].sort(comparePosition));
};

const createGraph = (input: {
  candidate: DraftInput['candidate'];
  typeVersion: {
    id: string;
    template:
      | 'STANDARD_CHOICE'
      | 'PASSAGE_CHOICE'
      | 'DIALOGUE_CHOICE'
      | 'INLINE_SPAN_CHOICE';
  };
  topicId: string;
  tagIds: string[];
  sentences: GeneratedDraftSentenceInput[];
  references: CanonicalReferences;
  newId: () => string;
}) => {
  const questionId = input.newId();
  const questionVersionId = input.newId();
  const resolvedSentences: ResolvedSentence[] = [];
  let sentenceCursor = 0;
  const blocks = input.candidate.payload.blocks.map((block, blockPosition) => {
    const blockId = input.newId();
    return {
      id: blockId,
      questionVersionId,
      kind: block.kind,
      displayMode: block.displayMode,
      position: blockPosition,
      sentences: block.sentences.map((entry, sentencePosition) => {
        const sentence = resolveSentence({
          sentence: input.sentences[sentenceCursor++]!,
          references: input.references,
          newId: input.newId,
        });
        resolvedSentences.push(sentence);
        return {
          id: input.newId(),
          blockId,
          sentenceVersionId: sentence.version.id,
          position: sentencePosition,
          speaker: entry.speaker,
        };
      }),
    };
  });

  const spanKeys = new Set<string>();
  const options = input.candidate.payload.options.map((option) => {
    const inline = input.typeVersion.template === 'INLINE_SPAN_CHOICE';
    if (inline !== (option.sentence === null)) notApprovable();
    const sentence =
      option.sentence === null
        ? null
        : resolveSentence({
            sentence: input.sentences[sentenceCursor++]!,
            references: input.references,
            newId: input.newId,
          });
    if (sentence) resolvedSentences.push(sentence);
    const targetBlock = option.span
      ? blocks[option.span.blockPosition]
      : undefined;
    const targetSentence = option.span
      ? targetBlock?.sentences[option.span.sentencePosition]
      : undefined;
    const targetGraph = targetSentence
      ? resolvedSentences.find(
          ({ version }) => version.id === targetSentence.sentenceVersionId,
        )
      : undefined;
    const spanKey = option.span
      ? `${option.span.blockPosition}:${option.span.sentencePosition}:${option.span.startTokenIndex}:${option.span.endTokenIndex}`
      : null;
    if (
      option.span &&
      (!targetGraph ||
        option.span.startTokenIndex < 0 ||
        option.span.endTokenIndex <= option.span.startTokenIndex ||
        option.span.endTokenIndex > targetGraph.tokens.length ||
        spanKeys.has(spanKey!))
    ) {
      notApprovable();
    }
    if (spanKey) spanKeys.add(spanKey);
    return {
      id: input.newId(),
      questionVersionId,
      sentenceVersionId: sentence?.version.id ?? null,
      position: option.position,
      isCorrect: option.clientRef === input.candidate.payload.correctOptionRef,
      spanSentenceVersionId: targetSentence?.sentenceVersionId ?? null,
      spanStartTokenIndex: option.span?.startTokenIndex ?? null,
      spanEndTokenIndex: option.span?.endTokenIndex ?? null,
    };
  });
  if (sentenceCursor !== input.sentences.length) notApprovable();

  return {
    question: {
      id: questionId,
      status: 'DRAFT' as const,
      currentPublishedVersionId: null,
    },
    version: {
      id: questionVersionId,
      questionId,
      version: 1,
      typeVersionId: input.typeVersion.id,
      topicId: input.topicId,
      difficulty: input.candidate.difficulty,
      status: 'DRAFT' as const,
      validationStatus: 'PENDING' as const,
      validationIssues: [],
      validatedAt: null,
      publishedAt: null,
    },
    tagIds: input.tagIds,
    sentences: resolvedSentences,
    blocks,
    options,
  };
};

/** outer 후보 transaction 안에서만 canonical graph insert를 수행하는 writer adapter */
export class DrizzleGeneratedQuestionDraftRepository implements GeneratedQuestionDraftWriter {
  constructor(private readonly generateId: () => string = randomUUID) {}

  /** 후보가 고정한 활성 참조를 검증한 뒤 nullable-audio DRAFT graph를 삽입한다 */
  async createDraft(
    transaction: QuestionProductionTransaction,
    input: DraftInput,
  ) {
    assertCandidatePayload(input);
    const [typeVersion] = await transaction
      .select({
        id: questionTypeVersions.id,
        slug: questionTypes.slug,
        version: questionTypeVersions.version,
        template: questionTypeVersions.template,
        optionCount: questionTypeVersions.optionCount,
      })
      .from(questionTypeVersions)
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .where(
        and(
          eq(questionTypeVersions.id, input.candidate.typeVersionId),
          eq(questionTypeVersions.status, 'ACTIVE'),
          eq(questionTypes.slug, input.candidate.payload.questionTypeSlug),
          eq(
            questionTypeVersions.version,
            input.candidate.payload.questionTypeVersion,
          ),
        ),
      )
      .for('key share')
      .limit(2);
    if (!typeVersion) return notApprovable();
    if (
      typeVersion.id !== input.candidate.typeVersionId ||
      typeVersion.slug !== input.candidate.payload.questionTypeSlug ||
      typeVersion.version !== input.candidate.payload.questionTypeVersion ||
      typeVersion.optionCount !== input.candidate.payload.options.length
    ) {
      notApprovable();
    }

    const [topic] = await transaction
      .select({ id: questionTopics.id, slug: questionTopics.slug })
      .from(questionTopics)
      .where(
        and(
          eq(questionTopics.id, input.candidate.topicId),
          eq(questionTopics.slug, input.candidate.payload.topicSlug),
          eq(questionTopics.status, 'ACTIVE'),
        ),
      )
      .for('key share')
      .limit(2);
    if (!topic) return notApprovable();
    if (
      topic.id !== input.candidate.topicId ||
      topic.slug !== input.candidate.payload.topicSlug
    ) {
      notApprovable();
    }

    const tagRows =
      input.candidate.payload.tagSlugs.length === 0
        ? []
        : await transaction
            .select({ id: questionTags.id, slug: questionTags.slug })
            .from(questionTags)
            .where(
              and(
                inArray(questionTags.slug, input.candidate.payload.tagSlugs),
                eq(questionTags.status, 'ACTIVE'),
              ),
            )
            .for('key share');
    const tagBySlug = new Map(tagRows.map((tag) => [tag.slug, tag.id]));
    if (
      tagRows.length !== input.candidate.payload.tagSlugs.length ||
      input.candidate.payload.tagSlugs.some((slug) => !tagBySlug.has(slug))
    ) {
      notApprovable();
    }

    const sentences = generatedSentences(input.candidate.payload).map(
      (sentence, index) => nullableSentence(sentence, `sentences.${index}`),
    );
    const references = await loadCanonicalReferences(transaction, sentences);
    const graph = createGraph({
      candidate: input.candidate,
      typeVersion,
      topicId: topic.id,
      tagIds: input.candidate.payload.tagSlugs.map((slug) =>
        tagBySlug.get(slug)!,
      ),
      sentences,
      references,
      newId: this.generateId,
    });
    await insertGraph(transaction, graph);
    return {
      questionId: graph.question.id,
      questionVersionId: graph.version.id,
    };
  }
}

/** FLEX 문제 유형 설정의 DRAFT·ACTIVE·RETIRED lifecycle을 조율한다 */
import type {
  CreateQuestionTypeInput,
  CreateQuestionTypeVersionInput,
  QuestionApprovedExampleSnapshot,
  QuestionDifficultyCriterion,
  QuestionMajorCategory,
  QuestionTaxonomyRepository,
  QuestionTaxonomyTermKind,
  QuestionTypeActivationResult,
  QuestionTypeDraftMutationResult,
  QuestionTypeVersionRecord,
} from './question-taxonomy.repository.js';
import {
  validateQuestionVersion,
  type QuestionSentenceCandidate,
  type QuestionVersionValidationCandidate,
} from './question-version.js';

/** taxonomy 설정 실패를 API가 분기할 안정적인 code */
export type QuestionTaxonomyErrorCode =
  | 'TYPE_VERSION_NOT_FOUND'
  | 'TYPE_VERSION_IMMUTABLE'
  | 'TYPE_VERSION_NOT_READY'
  | 'INVALID_LIFECYCLE_TRANSITION'
  | 'DIFFICULTY_CRITERIA_INVALID'
  | 'APPROVED_EXAMPLE_INVALID';

/** 문제 분류 설정 도메인 오류 */
export class QuestionTaxonomyError extends Error {
  constructor(readonly code: QuestionTaxonomyErrorCode) {
    super(code);
    this.name = 'QuestionTaxonomyError';
  }
}

const categorySkill = (
  category: QuestionMajorCategory,
): 'READING' | 'LISTENING' =>
  category.startsWith('LISTENING_') ? 'LISTENING' : 'READING';

const assertDraft = (version: QuestionTypeVersionRecord): void => {
  if (version.status !== 'DRAFT') {
    throw new QuestionTaxonomyError('TYPE_VERSION_IMMUTABLE');
  }
};

const hasCompleteCriteria = (
  criteria: QuestionDifficultyCriterion[],
): boolean =>
  criteria.length === 5 &&
  criteria.every(
    ({ difficulty, criteria: description }, index) =>
      difficulty === index + 1 && description.trim().length > 0,
  );

const isValidExample = (
  version: QuestionTypeVersionRecord,
  example: QuestionApprovedExampleSnapshot,
): boolean => {
  const refs = example.payload.options.map(({ clientRef }) => clientRef);
  return (
    example.title.trim().length > 0 &&
    example.payloadHash.length > 0 &&
    new Set(refs).size === refs.length &&
    validateQuestionVersion(toExampleCandidate(version, example)).status ===
      'PASSED'
  );
};

const toExampleCandidate = (
  version: QuestionTypeVersionRecord,
  example: QuestionApprovedExampleSnapshot,
): QuestionVersionValidationCandidate => {
  const sentenceIds = new Map<string, string>();
  const blocks = example.payload.blocks.map((block, blockPosition) => ({
    id: `example-block-${blockPosition}`,
    kind: block.kind,
    displayMode: block.displayMode,
    position: blockPosition,
    sentences: block.sentences.map(({ speaker, sentence }, sentencePosition) => {
      const id = `example-block-${blockPosition}-sentence-${sentencePosition}`;
      sentenceIds.set(`${blockPosition}:${sentencePosition}`, id);
      return {
        speaker: speaker ?? null,
        sentence: toExampleSentence(sentence, id),
      };
    }),
  }));
  return {
    id: 'approved-example',
    questionId: 'approved-example',
    difficulty: example.payload.difficulty,
    typeVersion: {
      id: version.id,
      template: version.template,
      optionCount: version.optionCount,
    },
    blocks,
    options: example.payload.options.map((option) => {
      const common = {
        id: option.clientRef,
        position: option.position,
        isCorrect: option.clientRef === example.payload.correctOptionRef,
      };
      if (option.sentence !== null) {
        return {
          ...common,
          sentence: toExampleSentence(
            option.sentence,
            `example-option-${option.position}`,
          ),
          span: null,
        };
      }
      return {
        ...common,
        sentence: null,
        span: {
          sentenceVersionId:
            sentenceIds.get(
              `${option.span.blockPosition}:${option.span.sentencePosition}`,
            ) ?? 'missing-example-sentence',
          startTokenIndex: option.span.startTokenIndex,
          endTokenIndex: option.span.endTokenIndex,
        },
      };
    }),
  };
};

type ExampleSentence =
  QuestionApprovedExampleSnapshot['payload']['blocks'][number]['sentences'][number]['sentence'];

const toExampleSentence = (
  sentence: ExampleSentence,
  id: string,
): QuestionSentenceCandidate => ({
  id,
  input: {
    originalText: sentence.originalText,
    translationKo: sentence.translationKo,
    pronunciationKo: sentence.pronunciationKo,
    toneMarks: sentence.toneMarks,
    mediaAssetId: sentence.mediaAssetId,
    tokens: sentence.tokens.map((token, position) => ({
      position,
      surface: token.surface,
      startOffset: token.startOffset,
      endOffset: token.endOffset,
      vocabularyId: token.vocabulary.id,
      meaningId: token.meaning.id,
      pronunciationId: token.pronunciation.id,
      contextMeaningKo: token.contextMeaningKo,
      role: token.role,
    })),
    expressions: sentence.expressions.map((expression) => ({
      startTokenIndex: expression.startTokenIndex,
      endTokenIndex: expression.endTokenIndex,
      vocabularyId: expression.vocabulary.id,
      vocabularyKind: 'EXPRESSION',
      meaningId: expression.meaning.id,
      pronunciationId: expression.pronunciation.id,
      contextMeaningKo: expression.contextMeaningKo,
      adminSelected: expression.representative ?? false,
    })),
  },
  mediaAsset: {
    id: sentence.mediaAssetId,
    kind: 'AUDIO',
    storageKey: `approved-example/${sentence.mediaAssetId}`,
    declaredMimeType: 'audio/mpeg',
    declaredSizeBytes: 1,
    declaredSha256: '0'.repeat(64),
    mimeType: 'audio/mpeg',
    sizeBytes: 1,
    sha256: '0'.repeat(64),
    status: 'READY',
    readyAt: new Date(0),
  },
  referencedVocabularies: sentence.tokens.map(({ vocabulary }) => ({
    id: vocabulary.id,
    status: 'PUBLISHED',
  })),
  pronunciationMediaAssets: [],
});

/** 문제 분류 설정 관리자 use case */
export class QuestionTaxonomyService {
  constructor(private readonly repository: QuestionTaxonomyRepository) {}

  /** 논리 유형과 첫 DRAFT 버전을 만든다 */
  createQuestionType(
    input: Omit<CreateQuestionTypeInput, 'skill'>,
  ): Promise<unknown> {
    return this.repository.createQuestionTypeWithDraft({
      ...input,
      skill: categorySkill(input.majorCategory),
    });
  }

  /** 기존 유형에 다음 DRAFT 버전을 만든다 */
  createNextDraft(
    questionTypeId: string,
    input: CreateQuestionTypeVersionInput,
  ): Promise<unknown> {
    return this.repository.createNextDraft(questionTypeId, input);
  }

  /** DRAFT 버전의 1~5 난이도 기준 전체를 교체한다 */
  async replaceDifficultyCriteria(
    versionId: string,
    criteria: QuestionDifficultyCriterion[],
  ): Promise<void> {
    const version = await this.requireVersion(versionId);
    assertDraft(version);
    if (!hasCompleteCriteria(criteria)) {
      throw new QuestionTaxonomyError('DIFFICULTY_CRITERIA_INVALID');
    }
    resolveDraftMutation(
      await this.repository.replaceDifficultyCriteria(versionId, criteria),
    );
  }

  /** DRAFT 버전에 검증된 canonical 예시 snapshot을 추가한다 */
  async addApprovedExample(
    versionId: string,
    example: QuestionApprovedExampleSnapshot,
  ): Promise<void> {
    const version = await this.requireVersion(versionId);
    assertDraft(version);
    if (!isValidExample(version, example)) {
      throw new QuestionTaxonomyError('APPROVED_EXAMPLE_INVALID');
    }
    resolveDraftMutation(
      await this.repository.addApprovedExample(versionId, example),
    );
  }

  /** DRAFT 버전의 승인 예시를 제거한다 */
  async removeApprovedExample(
    versionId: string,
    exampleId: string,
  ): Promise<void> {
    assertDraft(await this.requireVersion(versionId));
    resolveDraftMutation(
      await this.repository.removeApprovedExample(versionId, exampleId),
    );
  }

  /** 준비된 DRAFT를 ACTIVE로 원자 전환한다 */
  async activateVersion(versionId: string): Promise<void> {
    const version = await this.requireVersion(versionId);
    assertDraft(version);
    if (
      !hasCompleteCriteria(version.difficultyCriteria) ||
      version.approvedExamples.length < 1
    ) {
      throw new QuestionTaxonomyError('TYPE_VERSION_NOT_READY');
    }
    resolveActivation(await this.repository.activateVersion(versionId));
  }

  /** ACTIVE 버전을 RETIRED로 전환한다 */
  async retireVersion(versionId: string): Promise<void> {
    const version = await this.requireVersion(versionId);
    if (version.status !== 'ACTIVE') {
      throw new QuestionTaxonomyError('INVALID_LIFECYCLE_TRANSITION');
    }
    await this.repository.retireVersion(versionId);
  }

  /** 선택 가능한 주제 또는 태그를 만든다 */
  createTerm(
    kind: QuestionTaxonomyTermKind,
    input: { slug: string; displayName: string },
  ): Promise<unknown> {
    return this.repository.createTerm(kind, input);
  }

  /** 주제 또는 태그를 신규 선택 목록에서 보관 처리한다 */
  archiveTerm(
    kind: QuestionTaxonomyTermKind,
    termId: string,
  ): Promise<void> {
    return this.repository.archiveTerm(kind, termId);
  }

  private async requireVersion(
    versionId: string,
  ): Promise<QuestionTypeVersionRecord> {
    const version = await this.repository.findVersion(versionId);
    if (!version) {
      throw new QuestionTaxonomyError('TYPE_VERSION_NOT_FOUND');
    }
    return version;
  }
}

const resolveDraftMutation = (result: QuestionTypeDraftMutationResult): void => {
  if (result === 'UPDATED') return;
  if (result === 'NOT_FOUND') {
    throw new QuestionTaxonomyError('TYPE_VERSION_NOT_FOUND');
  }
  throw new QuestionTaxonomyError('TYPE_VERSION_IMMUTABLE');
};

const resolveActivation = (result: QuestionTypeActivationResult): void => {
  if (result === 'ACTIVATED') return;
  if (result === 'NOT_FOUND') {
    throw new QuestionTaxonomyError('TYPE_VERSION_NOT_FOUND');
  }
  if (result === 'NOT_READY') {
    throw new QuestionTaxonomyError('TYPE_VERSION_NOT_READY');
  }
  throw new QuestionTaxonomyError('TYPE_VERSION_IMMUTABLE');
};

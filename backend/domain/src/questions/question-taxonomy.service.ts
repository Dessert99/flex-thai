/** FLEX 문제 유형 설정의 DRAFT·ACTIVE·RETIRED lifecycle을 조율한다 */
import type {
  CreateQuestionTypeInput,
  CreateQuestionTypeVersionInput,
  QuestionApprovedExampleSnapshot,
  QuestionDifficultyCriterion,
  QuestionMajorCategory,
  QuestionTaxonomyRepository,
  QuestionTaxonomyTermKind,
  QuestionTypeVersionRecord,
} from './question-taxonomy.repository.js';

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
    Number.isInteger(example.payload.difficulty) &&
    example.payload.difficulty >= 1 &&
    example.payload.difficulty <= 5 &&
    refs.length === version.optionCount &&
    new Set(refs).size === refs.length &&
    refs.includes(example.payload.correctOptionRef)
  );
};

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
    await this.repository.replaceDifficultyCriteria(versionId, criteria);
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
    await this.repository.addApprovedExample(versionId, example);
  }

  /** DRAFT 버전의 승인 예시를 제거한다 */
  async removeApprovedExample(
    versionId: string,
    exampleId: string,
  ): Promise<void> {
    assertDraft(await this.requireVersion(versionId));
    await this.repository.removeApprovedExample(versionId, exampleId);
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
    await this.repository.activateVersion(versionId);
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

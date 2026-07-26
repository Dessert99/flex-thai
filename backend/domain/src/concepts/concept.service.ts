/** 개념 초안 검증과 수명주기 command를 조율한다 */
import type { ConceptContentValidator } from './concept-content.validator.js';
import { validateConceptCandidate } from './concept.js';
import type {
  ConceptAdminRepository,
  ConceptCommandContext,
  ConceptDraftRecord,
  ConceptValidationReport,
  CreateConceptCommand,
  ReplaceConceptDraftCommand,
} from './concept.repository.js';

export type ConceptDomainErrorCode =
  | 'CONCEPT_NOT_FOUND'
  | 'CONCEPT_VERSION_NOT_FOUND'
  | 'CONCEPT_DRAFT_ALREADY_EXISTS'
  | 'CONCEPT_VERSION_IMMUTABLE'
  | 'CONCEPT_REVISION_CONFLICT'
  | 'CONCEPT_VALIDATION_REQUIRED'
  | 'CONCEPT_INVALID_TRANSITION'
  | 'CONCEPT_REFERENCE_NOT_FOUND'
  | 'CONCEPT_PERSISTENCE_CONFLICT';

/** 개념 도메인 실패를 stable code로 전달한다 */
export class ConceptDomainError extends Error {
  constructor(readonly code: ConceptDomainErrorCode) {
    super(code);
    this.name = 'ConceptDomainError';
  }
}

/** 개념 command와 외부 validator를 조율한다 */
export class ConceptService {
  constructor(
    private readonly repository: ConceptAdminRepository,
    private readonly validator: ConceptContentValidator,
  ) {}

  /** 논리 개념과 첫 초안을 생성한다 */
  createConcept(
    input: CreateConceptCommand,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord> {
    return this.repository.createConcept(input, context);
  }

  /** 최신 버전에서 새 초안을 복제한다 */
  createNextDraft(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord> {
    return this.repository.createNextDraft(conceptId, context);
  }

  /** revision이 같은 초안 전체를 교체한다 */
  replaceDraft(
    versionId: string,
    input: ReplaceConceptDraftCommand,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord> {
    return this.repository.replaceDraft(versionId, input, context);
  }

  /** 결정적 구조·참조와 외부 품질을 검증해 같은 revision에 저장한다 */
  async validateVersion(
    versionId: string,
    context: ConceptCommandContext,
  ): Promise<ConceptValidationReport> {
    const candidate = await this.repository.loadValidationCandidate(versionId);
    if (!candidate) {
      throw new ConceptDomainError('CONCEPT_VERSION_NOT_FOUND');
    }
    if (candidate.status !== 'DRAFT') {
      throw new ConceptDomainError('CONCEPT_VERSION_IMMUTABLE');
    }
    const deterministicIssues = validateConceptCandidate(candidate);
    const externalIssues =
      deterministicIssues.length === 0
        ? await this.validator.validate(candidate)
        : [];
    return this.repository.saveValidation(
      {
        versionId,
        expectedRevision: candidate.revision,
        issues: [...deterministicIssues, ...externalIssues],
        validatedAt: context.occurredAt,
      },
      context,
    );
  }

  /** 검증된 같은 revision의 초안을 게시한다 */
  async publishVersion(
    versionId: string,
    context: ConceptCommandContext,
  ): Promise<void> {
    const candidate = await this.repository.loadValidationCandidate(versionId);
    if (!candidate) {
      throw new ConceptDomainError('CONCEPT_VERSION_NOT_FOUND');
    }
    await this.repository.publish(
      { versionId, expectedRevision: candidate.revision },
      context,
    );
  }

  /** 게시 개념을 숨긴다 */
  hideConcept(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<void> {
    return this.repository.hide(conceptId, context);
  }

  /** 현재 게시 버전이 유효한 숨김 개념을 복구한다 */
  restoreConcept(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<void> {
    return this.repository.restore(conceptId, context);
  }
}

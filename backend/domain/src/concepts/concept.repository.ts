/** 개념 수명주기를 원자 저장하는 repository port를 정의한다 */
import type {
  ConceptCandidateBlock,
  ConceptCategory,
  ConceptValidationCandidate,
  ConceptValidationIssue,
  ConceptValidationStatus,
} from './concept.js';

export interface ConceptCommandContext {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  occurredAt: Date;
}

export interface ConceptDraftInput {
  category: ConceptCategory;
  position: number;
  title: string;
  summary: string;
  blocks: ConceptCandidateBlock[];
}

export type CreateConceptCommand = ConceptDraftInput;
export interface ReplaceConceptDraftCommand extends ConceptDraftInput {
  revision: number;
}

/** 저장된 관리자 개념 초안 */
export interface ConceptDraftRecord extends ConceptValidationCandidate {
  version: number;
}

/** 저장된 개념 검증 보고서 */
export interface ConceptValidationReport {
  versionId: string;
  revision: number;
  status: ConceptValidationStatus;
  issues: ConceptValidationIssue[];
  validatedAt: Date;
}

/** 관리자 개념 command 저장 계약 */
export interface ConceptAdminRepository {
  createConcept(
    input: CreateConceptCommand,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord>;
  createNextDraft(
    conceptId: string,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord>;
  replaceDraft(
    versionId: string,
    input: ReplaceConceptDraftCommand,
    context: ConceptCommandContext,
  ): Promise<ConceptDraftRecord>;
  loadValidationCandidate(
    versionId: string,
  ): Promise<ConceptValidationCandidate | null>;
  saveValidation(
    input: {
      versionId: string;
      expectedRevision: number;
      issues: ConceptValidationIssue[];
      validatedAt: Date;
    },
    context: ConceptCommandContext,
  ): Promise<ConceptValidationReport>;
  publish(
    input: { versionId: string; expectedRevision: number },
    context: ConceptCommandContext,
  ): Promise<void>;
  hide(conceptId: string, context: ConceptCommandContext): Promise<void>;
  restore(conceptId: string, context: ConceptCommandContext): Promise<void>;
}

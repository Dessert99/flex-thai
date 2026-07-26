/** 개념 콘텐츠의 외부 품질 검증 port를 정의한다 */
import type {
  ConceptValidationCandidate,
  ConceptValidationIssue,
} from './concept.js';

/** 외부 품질 검증 adapter 계약 */
export interface ConceptContentValidator {
  validate(
    input: ConceptValidationCandidate,
  ): Promise<ConceptValidationIssue[]>;
}

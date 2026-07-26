/** 운영 개념 외부 검증 미구성을 fail-closed로 처리한다 */
import type {
  ConceptContentValidator,
  ConceptValidationCandidate,
  ConceptValidationIssue,
} from '@flex-thia/domain';

/** 외부 검증기가 준비되기 전 운영 게시를 차단한다 */
export class UnavailableConceptContentValidator implements ConceptContentValidator {
  /** 미구성 상태를 저장 가능한 외부 검증 문제로 반환한다 */
  validate(
    _input: ConceptValidationCandidate,
  ): Promise<ConceptValidationIssue[]> {
    return Promise.resolve([
      {
        source: 'EXTERNAL',
        path: 'content',
        code: 'CONCEPT_EXTERNAL_VALIDATOR_UNAVAILABLE',
        evidenceKo: '외부 품질 검증기를 사용할 수 없습니다.',
      },
    ]);
  }
}

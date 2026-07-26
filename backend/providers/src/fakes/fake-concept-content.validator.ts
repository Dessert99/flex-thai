/** 로컬 개념 콘텐츠 검증 adapter를 제공한다 */
import type {
  ConceptContentValidator,
  ConceptValidationCandidate,
  ConceptValidationIssue,
} from '@flex-thia/domain';

/** 로컬에서는 결정적 규칙만으로 개념 수동 테스트를 허용한다 */
export class FakeConceptContentValidator implements ConceptContentValidator {
  /** 외부 서비스 없이 추가 검증 문제를 만들지 않는다 */
  validate(
    input: ConceptValidationCandidate,
  ): Promise<ConceptValidationIssue[]> {
    void input;
    return Promise.resolve([]);
  }
}

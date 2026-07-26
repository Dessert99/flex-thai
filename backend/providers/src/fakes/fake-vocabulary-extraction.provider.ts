/** 외부 AI 없이 text별 어휘 후보 snapshot을 제공하는 local provider */
import type {
  ExtractedVocabularyCandidate,
  VocabularyExtractionProvider,
} from '@flex-thia/domain';

/** exact text fixture에 등록된 후보를 복제해 반환한다 */
export class FakeVocabularyExtractionProvider implements VocabularyExtractionProvider {
  constructor(
    private readonly fixtures: Record<string, ExtractedVocabularyCandidate[]>,
  ) {}

  /** 취소 신호를 지키고 호출 간 fixture mutation을 격리한다 */
  extract(
    input: Parameters<VocabularyExtractionProvider['extract']>[0],
  ): Promise<ExtractedVocabularyCandidate[]> {
    if (input.signal.aborted) {
      return Promise.reject(
        input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error('어휘 추출이 취소되었습니다'),
      );
    }
    return Promise.resolve(structuredClone(this.fixtures[input.text] ?? []));
  }
}

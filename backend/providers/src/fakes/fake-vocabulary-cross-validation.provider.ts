/** 외부 AI 없이 Thai별 교차 검증 결과를 제공하는 local provider */
import type { VocabularyCrossValidationProvider } from '@flex-thia/domain';

/** 등록한 Thai만 실패시키고 나머지는 통과시킨다 */
export class FakeVocabularyCrossValidationProvider implements VocabularyCrossValidationProvider {
  constructor(private readonly failures = new Map<string, string>()) {}

  /** 취소 신호와 Thai별 안정 오류 code를 반영한다 */
  validate(
    input: Parameters<VocabularyCrossValidationProvider['validate']>[0],
  ): Promise<{ status: 'PASSED' | 'FAILED'; code: string | null }> {
    if (input.signal.aborted) {
      return Promise.reject(
        input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error('어휘 교차 검증이 취소되었습니다'),
      );
    }
    const code = this.failures.get(input.candidate.thai) ?? null;
    return Promise.resolve({
      status: code ? 'FAILED' : 'PASSED',
      code,
    });
  }
}

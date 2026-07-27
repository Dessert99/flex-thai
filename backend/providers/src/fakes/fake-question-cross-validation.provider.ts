/** 외부 AI 없이 정답 참조별 문제 교차 검증 결과를 반환한다 */
import type { QuestionCrossValidationProvider } from '@flex-thia/domain';

/** 등록한 정답 참조만 실패시키는 결정적 교차 검증 provider */
export class FakeQuestionCrossValidationProvider implements QuestionCrossValidationProvider {
  constructor(private readonly failures = new Map<string, string>()) {}

  /** 취소 신호와 정답 참조별 안정 code·고정 사용량을 반영한다 */
  validate(
    input: Parameters<QuestionCrossValidationProvider['validate']>[0],
  ): ReturnType<QuestionCrossValidationProvider['validate']> {
    if (input.signal.aborted) {
      return Promise.reject(
        input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error('문제 교차 검증이 취소되었습니다'),
      );
    }

    const ref = input.candidate.payload.correctOptionRef;
    const code = this.failures.get(ref) ?? null;
    return Promise.resolve({
      status: code ? 'FAILED' : 'PASSED',
      code,
      evidence: { source: 'deterministic-fake' },
      usage: { inputTokens: 40, outputTokens: 10 },
      estimatedCostUsd: '0',
      providerRequestId: `fake-question-cross-validation-${ref}`,
    });
  }
}

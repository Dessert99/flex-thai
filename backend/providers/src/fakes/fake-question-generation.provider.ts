/** 외부 AI 없이 prompt version별 canonical 문제 후보 snapshot을 반환한다 */
import type {
  GeneratedQuestionCandidate,
  QuestionGenerationProvider,
} from '@flex-thia/domain';

/** exact prompt version fixture를 호출 간 mutation 없이 재생한다 */
export class FakeQuestionGenerationProvider implements QuestionGenerationProvider {
  constructor(
    private readonly fixtures: Record<string, GeneratedQuestionCandidate[]>,
  ) {}

  /** 취소 신호를 지키고 결정적인 후보·사용량 metadata를 반환한다 */
  generate(
    input: Parameters<QuestionGenerationProvider['generate']>[0],
  ): ReturnType<QuestionGenerationProvider['generate']> {
    if (input.signal.aborted) {
      return Promise.reject(
        input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error('문제 생성이 취소되었습니다'),
      );
    }

    return Promise.resolve({
      candidates: structuredClone(
        this.fixtures[input.prompt.promptVersion] ?? [],
      ),
      usage: { inputTokens: 120, outputTokens: 80 },
      estimatedCostUsd: '0',
      providerRequestId: `fake-${input.prompt.promptVersion}`,
    });
  }
}

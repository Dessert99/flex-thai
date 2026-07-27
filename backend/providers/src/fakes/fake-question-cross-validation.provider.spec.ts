/** 결정적 문제 교차 검증 fake가 후보별 안정 결과와 취소 신호를 지키는지 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  GeneratedQuestionCandidate,
  QuestionCrossValidationInput,
} from '@flex-thia/domain';
import { FakeQuestionCrossValidationProvider } from './fake-question-cross-validation.provider.js';

const candidate = {
  payload: { correctOptionRef: 'option-1' },
} as GeneratedQuestionCandidate;

const input = (signal: AbortSignal): QuestionCrossValidationInput => ({
  candidate,
  promptVersion: 'question-generation-v1',
  signal,
});

describe('결정적 문제 교차 검증 fake', () => {
  it('등록한 정답 참조만 안정 code로 실패시킨다', async () => {
    const provider = new FakeQuestionCrossValidationProvider(
      new Map([['option-1', 'ANSWER_DISAGREEMENT']]),
    );

    await expect(
      provider.validate(input(new AbortController().signal)),
    ).resolves.toEqual({
      status: 'FAILED',
      code: 'ANSWER_DISAGREEMENT',
      evidence: { source: 'deterministic-fake' },
      usage: { inputTokens: 40, outputTokens: 10 },
      estimatedCostUsd: '0',
      providerRequestId: 'fake-question-cross-validation-option-1',
    });
  });

  it('이미 취소된 호출은 검증 결과를 반환하지 않는다', async () => {
    const controller = new AbortController();
    controller.abort(new Error('lease lost'));
    const provider = new FakeQuestionCrossValidationProvider();

    await expect(provider.validate(input(controller.signal))).rejects.toThrow(
      'lease lost',
    );
  });
});

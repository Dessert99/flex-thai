/** Wave 5 provider 공개 진입점이 신규 AI 문제·TTS fake adapter를 노출하는지 검증한다 */
import {
  DeterministicTtsProvider,
  DeterministicTtsProviderError,
  FakeQuestionCrossValidationProvider,
  FakeQuestionGenerationProvider,
  FakeTtsAudioStore,
} from '@flex-thia/providers';
import { describe, expect, it } from 'vitest';

describe('Wave 5 providers 공개 import', () => {
  it('패키지 루트가 AI 문제와 TTS fake를 공개한다', () => {
    expect([
      DeterministicTtsProvider,
      DeterministicTtsProviderError,
      FakeQuestionCrossValidationProvider,
      FakeQuestionGenerationProvider,
      FakeTtsAudioStore,
    ]).not.toContain(undefined);
  });
});

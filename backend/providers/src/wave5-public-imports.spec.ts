/** Wave 5 provider 공개 진입점이 AI 문제·TTS local adapter를 노출하는지 검증한다 */
import {
  DeterministicTtsProvider,
  DeterministicTtsProviderError,
  FakeQuestionCrossValidationProvider,
  FakeQuestionGenerationProvider,
  FakeTtsAudioStore,
  LocalFileTtsAudioStore,
} from '@flex-thia/providers';
import { describe, expect, it } from 'vitest';

describe('Wave 5 providers 공개 import', () => {
  it('패키지 루트가 AI 문제와 TTS fake·filesystem store를 공개한다', () => {
    expect([
      DeterministicTtsProvider,
      DeterministicTtsProviderError,
      FakeQuestionCrossValidationProvider,
      FakeQuestionGenerationProvider,
      FakeTtsAudioStore,
      LocalFileTtsAudioStore,
    ]).not.toContain(undefined);
  });
});

/** Wave 6 TTS 도메인 공개 진입점의 값과 port를 검증한다 */
import {
  ContentTtsReadinessError,
  TtsDomainError,
  assertTtsVoicePresetCanDisable,
} from '@flex-thia/domain';
import type * as Domain from '@flex-thia/domain';
import { describe, expect, expectTypeOf, it } from 'vitest';

type Wave6DomainBoundary = [
  Domain.TtsVoicePresetVersion,
  Domain.TtsOperationAuditContext,
  Domain.TtsProvider,
  Domain.TtsAudioStore,
  Domain.TtsTargetAttachmentRepository,
];

describe('Wave 6 domain 공개 import', () => {
  it('패키지 루트가 TTS preset과 내구성 port를 공개한다', () => {
    expectTypeOf<Wave6DomainBoundary>().toBeArray();
    expect([
      ContentTtsReadinessError,
      TtsDomainError,
      assertTtsVoicePresetCanDisable,
    ]).not.toContain(undefined);
  });
});

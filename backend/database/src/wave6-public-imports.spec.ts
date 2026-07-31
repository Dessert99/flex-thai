/** Wave 6 TTS·비용 adapter와 schema의 공개 진입점을 검증한다 */
import {
  DrizzleOperationsCostSettingsRepository,
  DrizzleTtsVoicePresetQuery,
  DrizzleTtsVoicePresetRepository,
  DrizzleUsageCostOperationsQuery,
  operationsCostSettings,
} from '@flex-thia/database';
import { describe, expect, it } from 'vitest';

describe('Wave 6 database 공개 import', () => {
  it('패키지 루트가 TTS preset과 비용 운영 adapter를 공개한다', () => {
    expect([
      DrizzleOperationsCostSettingsRepository,
      DrizzleTtsVoicePresetQuery,
      DrizzleTtsVoicePresetRepository,
      DrizzleUsageCostOperationsQuery,
      operationsCostSettings,
    ]).not.toContain(undefined);
  });
});

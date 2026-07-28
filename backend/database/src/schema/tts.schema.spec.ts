/** 자동 TTS schema의 재사용 key와 항목 snapshot 무결성을 검증한다 */
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  ttsAudioCache,
  ttsAudioGcRecords,
  ttsItems,
  ttsJobs,
  ttsProviderRuns,
  ttsVoicePresets,
} from './tts.schema.js';

const hasUniqueColumns = (
  table: Parameters<typeof getTableConfig>[0],
  columns: string[],
): boolean => {
  const config = getTableConfig(table);

  return [
    ...config.indexes.filter(({ config: index }) => index.unique),
    ...config.uniqueConstraints,
  ].some((constraint) => {
    const constraintColumns =
      'config' in constraint ? constraint.config.columns : constraint.columns;

    return (
      constraintColumns.length === columns.length &&
      constraintColumns.every((column, index) => {
        const property = columns[index];

        return (
          property !== undefined &&
          'name' in column &&
          column.name ===
            property.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
        );
      })
    );
  });
};

describe('자동 TTS 데이터베이스 schema', () => {
  it('음성 preset과 job·item·cache를 분리해 저장한다', () => {
    expect(ttsVoicePresets).toBeDefined();
    expect(ttsJobs).toBeDefined();
    expect(ttsItems).toBeDefined();
    expect(ttsAudioCache).toBeDefined();
  });

  it('같은 음성 입력 cache와 같은 job target revision을 중복 저장하지 않는다', () => {
    expect(hasUniqueColumns(ttsAudioCache, ['cacheKey'])).toBe(true);
    expect(
      hasUniqueColumns(ttsItems, [
        'jobId',
        'targetKind',
        'targetId',
        'revision',
      ]),
    ).toBe(true);
  });

  it('재시도 attempt는 필수이고 worker lease는 비어 있을 수 있다', () => {
    expect(ttsJobs.dispatchAttempt.notNull).toBe(true);
    expect(ttsItems.attempt.notNull).toBe(true);
    expect(ttsItems.leaseToken.notNull).toBe(false);
  });

  it('cache 실패 결과와 생성 attempt를 다음 item과 명시적 재시도가 재사용할 수 있게 보존한다', () => {
    expect(ttsAudioCache.status.enumValues).toEqual([
      'PENDING',
      'GENERATING',
      'READY',
      'FAILED',
      'OUTCOME_UNKNOWN',
    ]);
    expect(ttsAudioCache.generationAttempt.notNull).toBe(true);
    expect(ttsAudioCache.errorCode.notNull).toBe(false);
    expect(ttsAudioCache.retryable.notNull).toBe(true);
  });

  it('READY cache는 완료 음성 자산과 metadata revision 시각을 모두 요구한다', () => {
    const constraint = getTableConfig(ttsAudioCache).checks.find(
      ({ name }) => name === 'tts_audio_cache_ready_metadata_consistent',
    );

    expect(constraint?.name).toBe('tts_audio_cache_ready_metadata_consistent');
    expect(
      constraint === undefined
        ? undefined
        : new PgDialect().sqlToQuery(constraint.value).sql,
    ).toBe(
      `"tts_audio_cache"."status" <> 'READY' or ("tts_audio_cache"."media_asset_id" is not null and "tts_audio_cache"."ready_metadata_revision" is not null and "tts_audio_cache"."ready_at" is not null)`,
    );
  });

  it('provider 실행은 item과 attempt마다 하나만 두고 원문·audio bytes 없이 운영 metadata만 저장한다', () => {
    expect(hasUniqueColumns(ttsProviderRuns, ['itemId', 'attempt'])).toBe(true);
    expect(ttsProviderRuns.cacheKey.notNull).toBe(true);
    expect(ttsProviderRuns.cacheClaimToken.notNull).toBe(true);
    expect(ttsProviderRuns.usage).toBeDefined();
    expect(ttsProviderRuns.estimatedCostUsd).toBeDefined();
    expect(ttsProviderRuns.providerRequestId).toBeDefined();
    expect(ttsProviderRuns.storageKey).toBeDefined();
    expect('audioBytes' in ttsProviderRuns).toBe(false);
    expect('rawPayload' in ttsProviderRuns).toBe(false);
  });

  it('orphan audio GC는 storage key를 유일하게 하고 lease와 terminal 결과를 분리한다', () => {
    expect(hasUniqueColumns(ttsAudioGcRecords, ['storageKey'])).toBe(true);
    expect(ttsAudioGcRecords.status.enumValues).toEqual([
      'PENDING',
      'PROCESSING',
      'REFERENCED',
      'DELETED',
    ]);
    expect(ttsAudioGcRecords.leaseOwner.notNull).toBe(false);
    expect(ttsAudioGcRecords.leaseExpiresAt.notNull).toBe(false);
    expect(ttsAudioGcRecords.lastErrorCode.notNull).toBe(false);
  });
});

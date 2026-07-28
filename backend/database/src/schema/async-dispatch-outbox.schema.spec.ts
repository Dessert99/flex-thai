/** 공유 비동기 dispatch outbox의 실행 식별자·lease·재시도 무결성을 검증한다 */
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  asyncDispatchOutbox,
  asyncDispatchPayloadKindEnum,
} from './async-dispatch-outbox.schema.js';

describe('공유 비동기 dispatch outbox schema', () => {
  it('콘텐츠 제작과 TTS payload kind만 저장한다', () => {
    expect(asyncDispatchPayloadKindEnum.enumValues).toEqual([
      'CONTENT_PRODUCTION',
      'TTS',
    ]);
  });

  it('실행 단위 idempotency key와 payload kind·job·attempt를 각각 유일하게 한다', () => {
    const uniqueIndexes = getTableConfig(asyncDispatchOutbox)
      .indexes.filter(({ config }) => config.unique)
      .map(({ config }) => config.name);

    expect(uniqueIndexes).toEqual(
      expect.arrayContaining([
        'async_dispatch_outbox_idempotency_key_unique',
        'async_dispatch_outbox_execution_unique',
      ]),
    );
  });

  it('lease 쌍과 음수가 아닌 attempt·delivery count를 constraint로 고정한다', () => {
    const checks = getTableConfig(asyncDispatchOutbox).checks.map(
      ({ name }) => name,
    );

    expect(checks).toEqual(
      expect.arrayContaining([
        'async_dispatch_outbox_attempt_non_negative',
        'async_dispatch_outbox_delivery_attempts_non_negative',
        'async_dispatch_outbox_lease_pair_consistent',
      ]),
    );
    expect(asyncDispatchOutbox.leaseOwner.notNull).toBe(false);
    expect(asyncDispatchOutbox.leaseExpiresAt.notNull).toBe(false);
  });

  it('미전달 가용 row를 kind·시간·lease 순서로 찾는 index를 둔다', () => {
    const indexes = getTableConfig(asyncDispatchOutbox).indexes.map(
      ({ config }) => config.name,
    );

    expect(indexes).toContain('async_dispatch_outbox_claim_idx');
  });
});

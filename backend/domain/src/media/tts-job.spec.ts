/** TTS 작업 항목 수명과 cache key의 결정 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  aggregateTtsJobStatus,
  assertContentTtsReady,
  assertTtsVoicePresetCanDisable,
  claimTtsItem,
  completeTtsItem,
  ContentTtsReadinessError,
  createTtsCacheKey,
  failTtsItem,
  retryTtsItems,
  type ContentTtsReadinessRepository,
  type TtsItem,
  type TtsVoiceSnapshot,
} from './tts-job.js';

const voice: TtsVoiceSnapshot = {
  presetId: 'thai-standard',
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  voice: 'th-TH-standard-a',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: '2026-07-27',
};

const createItem = (overrides: Partial<TtsItem> = {}): TtsItem => ({
  id: 'item-1',
  jobId: 'job-1',
  target: {
    kind: 'THAI_SENTENCE_VERSION',
    targetId: 'sentence-version-1',
    text: 'สวัสดี ครับ',
    required: true,
    revision: 'revision-1',
  },
  voice,
  cacheKey: 'cache-key',
  status: 'PENDING',
  attempt: 0,
  leaseToken: null,
  leaseUntil: null,
  errorCode: null,
  retryable: false,
  mediaAssetId: null,
  ...overrides,
});

const createWorkItem = (item: TtsItem) => ({
  jobId: item.jobId,
  itemId: item.id,
  attempt: item.attempt,
  leaseToken: item.leaseToken!,
  leaseUntil: item.leaseUntil!,
  target: item.target,
  voice: item.voice,
  cacheKey: item.cacheKey,
});

describe('TTS 작업 항목 수명', () => {
  it('PENDING 항목을 claim한 뒤 성공으로 완료하고 작업 집계를 완료한다', () => {
    const claimed = claimTtsItem(createItem(), {
      claimedAt: new Date('2026-07-27T00:00:00.000Z'),
      leaseToken: 'lease-1',
      leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
    });
    const succeeded = completeTtsItem(claimed, {
      item: createWorkItem(claimed),
      mediaAssetId: 'media-asset-1',
      claimToken: 'lease-1',
      completedAt: new Date('2026-07-27T00:01:00.000Z'),
    });

    expect(succeeded).toMatchObject({
      status: 'SUCCEEDED',
      mediaAssetId: 'media-asset-1',
      errorCode: null,
      retryable: false,
      leaseToken: null,
      leaseUntil: null,
    });
    expect(aggregateTtsJobStatus([succeeded])).toEqual({
      status: 'SUCCEEDED',
      counts: { pending: 0, processing: 0, succeeded: 1, failed: 0 },
    });
  });

  it('PENDING 항목을 claim한 뒤 실패로 완료하고 작업 집계를 실패로 만든다', () => {
    const claimed = claimTtsItem(createItem(), {
      claimedAt: new Date('2026-07-27T00:00:00.000Z'),
      leaseToken: 'lease-1',
      leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
    });
    const failed = failTtsItem(claimed, {
      item: createWorkItem(claimed),
      errorCode: 'TTS_PROVIDER_UNAVAILABLE',
      retryable: true,
      failedAt: new Date('2026-07-27T00:01:00.000Z'),
    });

    expect(failed).toMatchObject({
      status: 'FAILED',
      errorCode: 'TTS_PROVIDER_UNAVAILABLE',
      retryable: true,
      leaseToken: null,
      leaseUntil: null,
    });
    expect(aggregateTtsJobStatus([failed])).toEqual({
      status: 'FAILED',
      counts: { pending: 0, processing: 0, succeeded: 0, failed: 1 },
    });
  });

  it('만료된 lease를 새로 claim한 뒤 이전 lease의 완료를 거절한다', () => {
    const firstClaim = claimTtsItem(createItem(), {
      claimedAt: new Date('2026-07-27T00:00:00.000Z'),
      leaseToken: 'lease-old',
      leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
    });
    const renewedClaim = claimTtsItem(firstClaim, {
      claimedAt: new Date('2026-07-27T00:05:01.000Z'),
      leaseToken: 'lease-new',
      leaseUntil: new Date('2026-07-27T00:10:01.000Z'),
    });

    expect(() =>
      completeTtsItem(renewedClaim, {
        item: createWorkItem(firstClaim),
        mediaAssetId: 'media-asset-1',
        claimToken: 'lease-old',
        completedAt: new Date('2026-07-27T00:05:02.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'TTS_ITEM_STALE_LEASE' }));
  });

  it('terminal 항목은 다시 완료하거나 실패로 전이하지 않는다', () => {
    const succeeded = completeTtsItem(
      claimTtsItem(createItem(), {
        claimedAt: new Date('2026-07-27T00:00:00.000Z'),
        leaseToken: 'lease-1',
        leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
      }),
      {
        item: {
          jobId: 'job-1',
          itemId: 'item-1',
          attempt: 0,
          leaseToken: 'lease-1',
          leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
          target: createItem().target,
          voice,
          cacheKey: 'cache-key',
        },
        mediaAssetId: 'media-asset-1',
        claimToken: 'lease-1',
        completedAt: new Date('2026-07-27T00:01:00.000Z'),
      },
    );

    expect(() =>
      failTtsItem(succeeded, {
        item: {
          jobId: 'job-1',
          itemId: 'item-1',
          attempt: 0,
          leaseToken: 'lease-1',
          leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
          target: createItem().target,
          voice,
          cacheKey: 'cache-key',
        },
        errorCode: 'TTS_PROVIDER_UNAVAILABLE',
        retryable: true,
        failedAt: new Date('2026-07-27T00:02:00.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'TTS_ITEM_TERMINAL' }));
  });

  it('retryable FAILED 항목만 새 attempt의 PENDING으로 열고 작업을 다시 queue 상태로 만든다', () => {
    const retried = retryTtsItems(
      [
        createItem({
          id: 'retryable-item',
          status: 'FAILED',
          attempt: 0,
          errorCode: 'TTS_PROVIDER_TIMEOUT',
          retryable: true,
        }),
        createItem({
          id: 'succeeded-item',
          status: 'SUCCEEDED',
          attempt: 0,
          mediaAssetId: 'media-asset-1',
        }),
      ],
      {
        jobId: 'job-1',
        itemIds: ['retryable-item'],
        expectedAttempts: { 'retryable-item': 0 },
        requestedAt: new Date('2026-07-27T00:10:00.000Z'),
      },
    );

    expect(retried[0]).toMatchObject({
      id: 'retryable-item',
      status: 'PENDING',
      attempt: 1,
      errorCode: null,
      retryable: false,
      mediaAssetId: null,
    });
    expect(retried[1]).toMatchObject({
      id: 'succeeded-item',
      status: 'SUCCEEDED',
      attempt: 0,
      mediaAssetId: 'media-asset-1',
    });
    expect(aggregateTtsJobStatus(retried)).toEqual({
      status: 'QUEUED',
      counts: { pending: 1, processing: 0, succeeded: 1, failed: 0 },
    });
  });
});

describe('TTS voice preset 불변식', () => {
  it('active TTS preset은 disable할 수 없다', () => {
    expect(() =>
      assertTtsVoicePresetCanDisable('active-preset', 'active-preset'),
    ).toThrowError(
      expect.objectContaining({ code: 'TTS_VOICE_PRESET_ACTIVE_DISABLE' }),
    );
  });

  it('비활성 대상과 다른 active ID는 disable 검증을 통과한다', () => {
    expect(() =>
      assertTtsVoicePresetCanDisable('other-preset', 'active-preset'),
    ).not.toThrow();
  });
});

describe('TTS audio cache key', () => {
  it('NFKC·trim·공백 정규화가 같은 text와 같은 voice snapshot에 같은 SHA-256 key를 만든다', () => {
    expect(createTtsCacheKey('\uFF21\u00A0\u00A0สวัสดี  ', voice)).toBe(
      createTtsCacheKey('A สวัสดี', { ...voice }),
    );
  });

  it.each([
    ['provider', { provider: 'SECOND_PROVIDER' }],
    ['model', { model: 'deterministic-v2' }],
    ['voice', { voice: 'th-TH-standard-b' }],
    ['generation revision', { generationRevision: '2026-08-01' }],
  ] as const)('%s가 다르면 다른 SHA-256 key를 만든다', (_field, change) => {
    expect(createTtsCacheKey('สวัสดี', voice)).not.toBe(
      createTtsCacheKey('สวัสดี', { ...voice, ...change }),
    );
  });
});

describe('게시 전 TTS 준비 상태', () => {
  it('읽기 문제의 MISSING·FAILED·UPLOADING target을 ID 오름차순으로 차단한다', () => {
    const repository: ContentTtsReadinessRepository = {
      listRequiredTargets: (content) => {
        expect(content).toEqual({
          questionId: 'reading-question-1',
          versionId: 'reading-version-1',
        });
        return Promise.resolve([
          {
            kind: 'THAI_SENTENCE_VERSION',
            targetId: 'sentence-3',
            mediaStatus: 'FAILED',
          },
          {
            kind: 'VOCABULARY_PRONUNCIATION',
            targetId: 'vocabulary-1',
            mediaStatus: 'READY',
          },
          {
            kind: 'THAI_SENTENCE_VERSION',
            targetId: 'sentence-1',
            mediaStatus: 'UPLOADING',
          },
          {
            kind: 'VOCABULARY_PRONUNCIATION',
            targetId: 'expression-2',
            mediaStatus: 'MISSING',
          },
        ]);
      },
    };

    return repository
      .listRequiredTargets({
        questionId: 'reading-question-1',
        versionId: 'reading-version-1',
      })
      .then((targets) => {
        expect(() => assertContentTtsReady(targets)).toThrowError(
          expect.objectContaining({
            code: 'CONTENT_TTS_NOT_READY',
            targetIds: ['expression-2', 'sentence-1', 'sentence-3'],
          }),
        );
      });
  });

  it('듣기 문제의 MISSING·FAILED·UPLOADING target을 차단한다', () => {
    expect(() =>
      assertContentTtsReady([
        {
          kind: 'THAI_SENTENCE_VERSION',
          targetId: 'listening-sentence-1',
          mediaStatus: 'MISSING',
        },
        {
          kind: 'VOCABULARY_PRONUNCIATION',
          targetId: 'listening-expression-1',
          mediaStatus: 'FAILED',
        },
        {
          kind: 'THAI_SENTENCE_VERSION',
          targetId: 'listening-sentence-2',
          mediaStatus: 'UPLOADING',
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: 'CONTENT_TTS_NOT_READY',
        targetIds: [
          'listening-expression-1',
          'listening-sentence-1',
          'listening-sentence-2',
        ],
      }),
    );
  });

  it('모든 필수 target이 READY면 게시를 허용한다', () => {
    expect(() =>
      assertContentTtsReady([
        {
          kind: 'VOCABULARY_PRONUNCIATION',
          targetId: 'expression-1',
          mediaStatus: 'READY',
        },
        {
          kind: 'THAI_SENTENCE_VERSION',
          targetId: 'sentence-1',
          mediaStatus: 'READY',
        },
      ]),
    ).not.toThrow();
  });

  it('동일 target은 한 번만 오류에 포함한다', () => {
    try {
      assertContentTtsReady([
        {
          kind: 'THAI_SENTENCE_VERSION',
          targetId: 'sentence-1',
          mediaStatus: 'FAILED',
        },
        {
          kind: 'THAI_SENTENCE_VERSION',
          targetId: 'sentence-1',
          mediaStatus: 'MISSING',
        },
      ]);
      throw new Error('expected readiness error');
    } catch (error) {
      expect(error).toBeInstanceOf(ContentTtsReadinessError);
      expect(error).toMatchObject({
        code: 'CONTENT_TTS_NOT_READY',
        targetIds: ['sentence-1'],
      });
    }
  });
});

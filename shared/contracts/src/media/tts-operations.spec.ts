/** 관리자 TTS 작업 조회·재시도 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  retryTtsItemRequestSchema,
  retryTtsJobRequestSchema,
  ttsItemPathSchema,
  ttsJobDetailResponseSchema,
  ttsJobItemsQuerySchema,
  ttsJobListQuerySchema,
  ttsJobListResponseSchema,
  ttsJobPathSchema,
  ttsRetryResponseSchema,
} from './tts-operations.js';

const ids = {
  job: '00000000-0000-4000-8000-000000000001',
  item: '00000000-0000-4000-8000-000000000002',
  requester: '00000000-0000-4000-8000-000000000003',
  target: '00000000-0000-4000-8000-000000000004',
  preset: '00000000-0000-4000-8000-000000000005',
} as const;

const page = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
};

const summary = {
  id: ids.job,
  status: 'PARTIALLY_FAILED',
  requestedBy: ids.requester,
  counts: { pending: 1, processing: 2, succeeded: 3, failed: 4 },
  createdAt: '2026-07-27T00:00:00.000Z',
  startedAt: '2026-07-27T00:01:00.000Z',
  finishedAt: null,
};

describe('TTS 작업 조회 계약', () => {
  it('상태·기간·페이지 query를 정규화하고 역전 기간을 거부한다', () => {
    expect(
      ttsJobListQuerySchema.parse({
        status: 'PARTIALLY_FAILED',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      status: 'PARTIALLY_FAILED',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      page: 2,
      pageSize: 50,
    });
    expect(ttsJobListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(() =>
      ttsJobListQuerySchema.parse({
        from: '2026-07-28T00:00:00.000Z',
        to: '2026-07-27T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('작업·항목 UUID와 항목 필터의 엄격한 범위를 검증한다', () => {
    expect(ttsJobPathSchema.parse({ jobId: ids.job })).toEqual({
      jobId: ids.job,
    });
    expect(ttsItemPathSchema.parse({ itemId: ids.item })).toEqual({
      itemId: ids.item,
    });
    expect(
      ttsJobItemsQuerySchema.parse({
        status: 'FAILED',
        errorCode: 'TTS_PROVIDER_TIMEOUT',
        page: '3',
        pageSize: '100',
      }),
    ).toEqual({
      status: 'FAILED',
      errorCode: 'TTS_PROVIDER_TIMEOUT',
      page: 3,
      pageSize: 100,
    });
    expect(() => ttsJobPathSchema.parse({ jobId: 'not-uuid' })).toThrow();
    expect(() => ttsJobItemsQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => ttsJobItemsQuerySchema.parse({ unknown: true })).toThrow();
  });

  it('집계와 retryable 항목을 ISO datetime 공개 응답으로 제한한다', () => {
    const detail = ttsJobDetailResponseSchema.parse({
      ...summary,
      voice: {
        presetId: ids.preset,
        provider: 'local',
        model: 'deterministic-v1',
        voice: 'thai-female',
        locale: 'th-TH',
        audioFormat: 'audio/wav',
        generationRevision: '2026-07-27',
      },
      items: [
        {
          id: ids.item,
          target: {
            kind: 'THAI_SENTENCE_VERSION',
            targetId: ids.target,
            text: 'สวัสดี',
            required: true,
            revision: 'sentence-v1',
          },
          status: 'FAILED',
          attempt: 2,
          errorCode: 'TTS_PROVIDER_TIMEOUT',
          retryable: true,
          mediaAssetId: null,
        },
      ],
      itemPage: page,
    });

    expect(detail.counts).toEqual({
      pending: 1,
      processing: 2,
      succeeded: 3,
      failed: 4,
    });
    expect(detail.items[0]?.retryable).toBe(true);
    expect(() =>
      ttsJobListResponseSchema.parse({
        items: [{ ...summary, createdAt: '2026-07-27' }],
        page,
      }),
    ).toThrow();
    expect(() =>
      ttsJobDetailResponseSchema.parse({
        ...detail,
        storageKey: 'private/audio.wav',
      }),
    ).toThrow();
  });
});

describe('TTS 재시도 계약', () => {
  it('일괄 선택을 최대 100개 UUID와 optimistic attempt로 제한한다', () => {
    expect(
      retryTtsJobRequestSchema.parse({
        items: [{ itemId: ids.item, expectedAttempt: 2 }],
      }),
    ).toEqual({
      items: [{ itemId: ids.item, expectedAttempt: 2 }],
    });

    const overLimit = Array.from({ length: 101 }, (_, index) => ({
      itemId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      expectedAttempt: 1,
    }));
    expect(() =>
      retryTtsJobRequestSchema.parse({ items: overLimit }),
    ).toThrow();
    expect(() =>
      retryTtsJobRequestSchema.parse({
        items: [{ itemId: ids.item, expectedAttempt: 2, unknown: true }],
      }),
    ).toThrow();
  });

  it('개별 재시도 입력과 접수 응답에서 UUID·개수를 엄격히 검증한다', () => {
    expect(
      retryTtsItemRequestSchema.parse({
        jobId: ids.job,
        expectedAttempt: 2,
      }),
    ).toEqual({ jobId: ids.job, expectedAttempt: 2 });
    expect(
      ttsRetryResponseSchema.parse({
        jobId: ids.job,
        itemIds: [ids.item],
        retriedCount: 1,
      }),
    ).toEqual({
      jobId: ids.job,
      itemIds: [ids.item],
      retriedCount: 1,
    });
    expect(() =>
      retryTtsItemRequestSchema.parse({
        jobId: ids.job,
        expectedAttempt: -1,
      }),
    ).toThrow();
    expect(() =>
      ttsRetryResponseSchema.parse({
        jobId: ids.job,
        itemIds: [ids.item],
        retriedCount: 2,
      }),
    ).toThrow();
  });
});

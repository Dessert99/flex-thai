/** 생성 문제 승인 TTS scheduler의 snapshot·대상·outbox 원자성을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  asyncDispatchOutbox,
  questionBlockSentences,
  questionOptions,
  questionVersions,
  thaiSentenceVersions,
  ttsItems,
  ttsJobs,
  ttsVoicePresets,
} from '../../schema/index.js';
import { DrizzleGeneratedQuestionTtsScheduler } from './drizzle-generated-question-tts.scheduler.js';

const requestedAt = new Date('2026-07-28T00:00:00.000Z');
const presetId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const questionId = '00000000-0000-4000-8000-000000000003';
const questionVersionId = '00000000-0000-4000-8000-000000000004';
const firstSentenceId = '00000000-0000-4000-8000-000000000005';
const secondSentenceId = '00000000-0000-4000-8000-000000000006';
const jobId = '00000000-0000-4000-8000-000000000007';
const itemIds = [
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000009',
];

const preset = {
  id: presetId,
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: 'v1',
  enabled: true,
};

const createSelect = (
  rowsByTable: Map<unknown, unknown[]>,
  selectedTables: unknown[],
) =>
  vi.fn(() => {
    let rows: unknown[] = [];
    const chain = {
      from: vi.fn((table: unknown) => {
        selectedTables.push(table);
        rows = rowsByTable.get(table) ?? [];
        return chain;
      }),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      for: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  });

const createTransaction = (overrides?: {
  presetRows?: unknown[];
  sentenceRows?: unknown[];
}) => {
  const selectedTables: unknown[] = [];
  const rowsByTable = new Map<unknown, unknown[]>([
    [ttsVoicePresets, overrides?.presetRows ?? [preset]],
    [
      questionVersions,
      [{ id: questionVersionId, questionId, status: 'DRAFT' }],
    ],
    [
      questionBlockSentences,
      [
        { sentenceVersionId: firstSentenceId },
        { sentenceVersionId: secondSentenceId },
      ],
    ],
    [
      questionOptions,
      [
        {
          sentenceVersionId: secondSentenceId,
          spanSentenceVersionId: firstSentenceId,
        },
      ],
    ],
    [
      thaiSentenceVersions,
      overrides?.sentenceRows ?? [
        {
          id: firstSentenceId,
          originalText: 'สวัสดี',
          mediaAssetId: null,
          frozenAt: null,
        },
        {
          id: secondSentenceId,
          originalText: 'ขอบคุณ',
          mediaAssetId: null,
          frozenAt: null,
        },
      ],
    ],
  ]);
  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => {
      inserted.push({ table, values });
      return Promise.resolve();
    }),
  }));
  return {
    inserted,
    selectedTables,
    transaction: {
      insert,
      select: createSelect(rowsByTable, selectedTables),
    },
  };
};

describe('생성 문제 TTS scheduler', () => {
  it('설정 preset snapshot과 중복 제거한 정확한 문장 버전을 한 job으로 만든다', async () => {
    const fixture = createTransaction();
    const enqueueTts = vi.fn().mockResolvedValue(undefined);
    const ids = [jobId, ...itemIds];
    const scheduler = new DrizzleGeneratedQuestionTtsScheduler(
      presetId,
      { enqueueTts },
      () => ids.shift()!,
    );

    await expect(
      scheduler.schedule(fixture.transaction as never, {
        draft: { questionId, questionVersionId },
        requestedBy: userId,
        requestedAt,
      }),
    ).resolves.toEqual({ jobId });

    expect(fixture.selectedTables).toEqual([
      ttsVoicePresets,
      questionVersions,
      questionBlockSentences,
      questionOptions,
      thaiSentenceVersions,
    ]);
    expect(
      fixture.inserted.find(({ table }) => table === ttsJobs)?.values,
    ).toMatchObject({
      id: jobId,
      requestedBy: userId,
      pendingCount: 2,
      voiceSnapshot: {
        presetId,
        provider: preset.provider,
        model: preset.model,
        voice: preset.voice,
        locale: 'th-TH',
        audioFormat: 'audio/wav',
        generationRevision: preset.generationRevision,
      },
    });
    expect(
      fixture.inserted.find(({ table }) => table === ttsItems)?.values,
    ).toEqual([
      expect.objectContaining({
        id: itemIds[0],
        jobId,
        targetKind: 'THAI_SENTENCE_VERSION',
        targetId: firstSentenceId,
        targetText: 'สวัสดี',
        targetRequired: true,
        revision: questionVersionId,
        mediaAssetId: null,
      }),
      expect.objectContaining({
        id: itemIds[1],
        jobId,
        targetKind: 'THAI_SENTENCE_VERSION',
        targetId: secondSentenceId,
        targetText: 'ขอบคุณ',
        targetRequired: true,
        revision: questionVersionId,
        mediaAssetId: null,
      }),
    ]);
    expect(enqueueTts).toHaveBeenCalledWith(fixture.transaction, {
      jobId,
      attempt: 0,
      requestedAt,
    });
    expect(
      fixture.inserted.some(({ table }) => table === asyncDispatchOutbox),
    ).toBe(false);
  });

  it('설정 preset이 없거나 비활성화되면 graph 뒤 schedule을 fail closed한다', async () => {
    for (const presetRows of [[], [{ ...preset, enabled: false }]]) {
      const fixture = createTransaction({ presetRows });
      const scheduler = new DrizzleGeneratedQuestionTtsScheduler(presetId, {
        enqueueTts: vi.fn(),
      });

      await expect(
        scheduler.schedule(fixture.transaction as never, {
          draft: { questionId, questionVersionId },
          requestedBy: userId,
          requestedAt,
        }),
      ).rejects.toThrow('GENERATED_QUESTION_TTS_PRESET_UNAVAILABLE');
      expect(fixture.inserted).toHaveLength(0);
    }
  });

  it('graph 대상 row가 누락되거나 이미 연결됐으면 item과 outbox를 만들지 않는다', async () => {
    const enqueueTts = vi.fn();
    const invalidRows = [
      [
        {
          id: firstSentenceId,
          originalText: 'สวัสดี',
          mediaAssetId: null,
          frozenAt: null,
        },
      ],
      [
        {
          id: firstSentenceId,
          originalText: 'สวัสดี',
          mediaAssetId: userId,
          frozenAt: null,
        },
        {
          id: secondSentenceId,
          originalText: 'ขอบคุณ',
          mediaAssetId: null,
          frozenAt: null,
        },
      ],
    ];
    for (const sentenceRows of invalidRows) {
      const fixture = createTransaction({ sentenceRows });
      const scheduler = new DrizzleGeneratedQuestionTtsScheduler(presetId, {
        enqueueTts,
      });

      await expect(
        scheduler.schedule(fixture.transaction as never, {
          draft: { questionId, questionVersionId },
          requestedBy: userId,
          requestedAt,
        }),
      ).rejects.toThrow('GENERATED_QUESTION_TTS_TARGET_MISMATCH');
      expect(fixture.inserted).toHaveLength(0);
      expect(enqueueTts).not.toHaveBeenCalled();
    }
  });
});

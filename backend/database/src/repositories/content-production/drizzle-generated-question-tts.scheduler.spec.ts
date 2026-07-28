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
import { createTtsInitialCommandFingerprint } from '../dispatch/drizzle-async-dispatch-outbox.repository.js';
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
  blockRows?: unknown[];
  optionRows?: unknown[];
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
      overrides?.blockRows ?? [
        { sentenceVersionId: firstSentenceId },
        { sentenceVersionId: secondSentenceId },
      ],
    ],
    [
      questionOptions,
      overrides?.optionRows ?? [
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
      { enqueueTts, assertTtsDispatch: vi.fn() },
      () => ids.shift()!,
    );

    await expect(
      scheduler.schedule(fixture.transaction as never, {
        draft: { questionId, questionVersionId },
        requestedBy: userId,
        requestedAt,
      }),
    ).resolves.toEqual({ jobIds: [jobId] });

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
      lastDispatchCommandFingerprint: createTtsInitialCommandFingerprint(jobId),
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
    const jobValues = fixture.inserted.find(({ table }) => table === ttsJobs)
      ?.values as { lastDispatchCommandFingerprint: string };
    expect(enqueueTts).toHaveBeenCalledWith(fixture.transaction, {
      jobId,
      attempt: 0,
      commandFingerprint: jobValues.lastDispatchCommandFingerprint,
      requestedAt,
    });
    expect(
      fixture.inserted.some(({ table }) => table === asyncDispatchOutbox),
    ).toBe(false);
  });

  it('speaker role과 default voice별로 문장을 중복 없이 여러 job에 partition한다', async () => {
    const thirdSentenceId = '00000000-0000-4000-8000-000000000010';
    const optionSentenceId = '00000000-0000-4000-8000-000000000011';
    const roleAPresetId = '00000000-0000-4000-8000-000000000012';
    const roleBPresetId = '00000000-0000-4000-8000-000000000013';
    const fixture = createTransaction({
      presetRows: [
        preset,
        { ...preset, id: roleAPresetId, voice: 'thai-role-a' },
        { ...preset, id: roleBPresetId, voice: 'thai-role-b' },
      ],
      blockRows: [
        { sentenceVersionId: firstSentenceId, speaker: 'A' },
        { sentenceVersionId: secondSentenceId, speaker: 'B' },
        { sentenceVersionId: thirdSentenceId, speaker: null },
      ],
      optionRows: [
        { sentenceVersionId: optionSentenceId, spanSentenceVersionId: null },
      ],
      sentenceRows: [
        {
          id: firstSentenceId,
          originalText: 'ประโยค A',
          mediaAssetId: null,
          frozenAt: null,
        },
        {
          id: secondSentenceId,
          originalText: 'ประโยค B',
          mediaAssetId: null,
          frozenAt: null,
        },
        {
          id: thirdSentenceId,
          originalText: 'ประโยคหลัก',
          mediaAssetId: null,
          frozenAt: null,
        },
        {
          id: optionSentenceId,
          originalText: 'ตัวเลือก',
          mediaAssetId: null,
          frozenAt: null,
        },
      ],
    });
    const enqueueTts = vi.fn().mockResolvedValue(undefined);
    const ids = [
      '00000000-0000-4000-8000-000000000020',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000023',
      '00000000-0000-4000-8000-000000000024',
      '00000000-0000-4000-8000-000000000025',
      '00000000-0000-4000-8000-000000000026',
    ];
    const scheduler = new DrizzleGeneratedQuestionTtsScheduler(
      presetId,
      { enqueueTts, assertTtsDispatch: vi.fn() },
      () => ids.shift()!,
    );

    const result = await scheduler.schedule(fixture.transaction as never, {
      draft: { questionId, questionVersionId },
      requestedBy: userId,
      requestedAt,
      voicePolicy: {
        defaultVoicePresetId: presetId,
        speakerVoiceAssignments: [
          { speakerRole: 'A', voicePresetId: roleAPresetId },
          { speakerRole: 'B', voicePresetId: roleBPresetId },
        ],
      },
    });

    expect(result.jobIds).toHaveLength(3);
    const itemBatches = fixture.inserted
      .filter(({ table }) => table === ttsItems)
      .flatMap(({ values }) => values as Array<Record<string, unknown>>);
    expect(itemBatches.map(({ targetId }) => targetId).sort()).toEqual(
      [
        firstSentenceId,
        secondSentenceId,
        thirdSentenceId,
        optionSentenceId,
      ].sort(),
    );
    expect(new Set(itemBatches.map(({ targetId }) => targetId).filter(Boolean)).size).toBe(
      4,
    );
    expect(enqueueTts).toHaveBeenCalledTimes(3);
  });

  it('같은 문장 참조가 서로 다른 speaker role에 연결되면 실패한다', async () => {
    const fixture = createTransaction({
      blockRows: [
        { sentenceVersionId: firstSentenceId, speaker: 'A' },
        { sentenceVersionId: firstSentenceId, speaker: 'B' },
      ],
      optionRows: [],
    });
    const scheduler = new DrizzleGeneratedQuestionTtsScheduler(presetId, {
      enqueueTts: vi.fn(),
      assertTtsDispatch: vi.fn(),
    });

    await expect(
      scheduler.schedule(fixture.transaction as never, {
        draft: { questionId, questionVersionId },
        requestedBy: userId,
        requestedAt,
      }),
    ).rejects.toThrow('GENERATED_QUESTION_TTS_TARGET_MISMATCH');
    expect(fixture.inserted).toHaveLength(0);
  });

  it('설정 preset이 없거나 비활성화되면 graph 뒤 schedule을 fail closed한다', async () => {
    for (const presetRows of [[], [{ ...preset, enabled: false }]]) {
      const fixture = createTransaction({ presetRows });
      const scheduler = new DrizzleGeneratedQuestionTtsScheduler(presetId, {
        enqueueTts: vi.fn(),
        assertTtsDispatch: vi.fn(),
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
        assertTtsDispatch: vi.fn(),
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

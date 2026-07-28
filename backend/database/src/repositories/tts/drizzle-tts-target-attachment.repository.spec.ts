/** TTS 성공 transaction의 대상 연결이 DRAFT revision과 READY media를 원자 검증하는지 고정한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  thaiSentenceVersions,
  vocabularyPronunciations,
} from '../../schema/index.js';
import { DrizzleTtsTargetAttachmentWriter } from './drizzle-tts-target-attachment.repository.js';

type QueryRows = Array<Record<string, unknown>>;

interface UpdateCall {
  table: unknown;
  values?: Record<string, unknown>;
  condition?: unknown;
}

const createTransaction = (
  selectResults: QueryRows[],
  returningRows: QueryRows[] = [[{ id: 'updated-target-id' }]],
) => {
  const pendingSelects = [...selectResults];
  const pendingReturns = [...returningRows];
  const locks: unknown[] = [];
  const updates: UpdateCall[] = [];
  const select = vi.fn(() => {
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      for: vi.fn(),
      limit: vi.fn(),
      then: undefined as
        | ((
            resolve: (rows: QueryRows) => unknown,
            reject: (error: unknown) => unknown,
          ) => Promise<unknown>)
        | undefined,
    };
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.for.mockImplementation((mode: unknown) => {
      locks.push(mode);
      return chain;
    });
    chain.limit.mockImplementation(() =>
      Promise.resolve(pendingSelects.shift() ?? []),
    );
    chain.then = (resolve, reject) =>
      Promise.resolve(pendingSelects.shift() ?? []).then(resolve, reject);
    return chain;
  });
  const update = vi.fn((table: unknown) => {
    const call: UpdateCall = { table };
    updates.push(call);
    return {
      set: vi.fn((values: Record<string, unknown>) => {
        call.values = values;
        return {
          where: vi.fn((condition: unknown) => {
            call.condition = condition;
            return {
              returning: vi.fn(() =>
                Promise.resolve(pendingReturns.shift() ?? []),
              ),
            };
          }),
        };
      }),
    };
  });
  return { transaction: { select, update }, locks, updates };
};

const toSqlParams = (condition: unknown): unknown[] =>
  new PgDialect().sqlToQuery(condition as never).params;

const target = {
  kind: 'THAI_SENTENCE_VERSION' as const,
  targetId: '10000000-0000-4000-8000-000000000001',
  text: 'ภาษาไทย',
  required: true,
  revision: '20000000-0000-4000-8000-000000000001',
};
const mediaAssetId = '30000000-0000-4000-8000-000000000001';

const draftVersion = [
  {
    id: target.revision,
    questionId: '40000000-0000-4000-8000-000000000001',
    status: 'DRAFT',
  },
];
const blockReference = [[{ sentenceVersionId: target.targetId }], []];
const currentSentence = {
  id: target.targetId,
  originalText: target.text,
  mediaAssetId: null,
  frozenAt: null,
};
const readyMedia = [{ id: mediaAssetId, status: 'READY' }];

describe('DrizzleTtsTargetAttachmentWriter DRAFT 대상 연결', () => {
  it('현재 DRAFT가 참조하는 동일 text 문장에 READY media를 연결한다', async () => {
    const fake = createTransaction([
      draftVersion,
      ...blockReference,
      [currentSentence],
      readyMedia,
    ]);
    const writer = new DrizzleTtsTargetAttachmentWriter();

    await expect(
      writer.attach(fake.transaction as never, {
        target,
        mediaAssetId,
        expectedRevision: target.revision,
      }),
    ).resolves.toBe('ATTACHED');

    expect(fake.locks).toEqual(['update', 'update', 'share']);
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]).toMatchObject({
      table: thaiSentenceVersions,
      values: { mediaAssetId },
    });
    expect(toSqlParams(fake.updates[0]?.condition)).toEqual(
      expect.arrayContaining([target.targetId]),
    );
  });

  it('같은 READY media replay는 update 없이 정확히 한 연결로 인정한다', async () => {
    const fake = createTransaction([
      draftVersion,
      ...blockReference,
      [{ ...currentSentence, mediaAssetId }],
      readyMedia,
    ]);
    const writer = new DrizzleTtsTargetAttachmentWriter();

    await expect(
      writer.attach(fake.transaction as never, {
        target,
        mediaAssetId,
        expectedRevision: target.revision,
      }),
    ).resolves.toBe('ATTACHED');
    expect(fake.updates).toEqual([]);
  });

  it.each([
    {
      name: 'snapshot과 expected revision 불일치',
      input: { expectedRevision: 'different-revision' },
      rows: [] as QueryRows[],
    },
    {
      name: '게시된 문제 버전',
      input: {},
      rows: [[]],
    },
    {
      name: '문제 graph가 참조하지 않는 문장',
      input: {},
      rows: [draftVersion, [], [], [currentSentence], readyMedia],
    },
    {
      name: '동결된 문장',
      input: {},
      rows: [
        draftVersion,
        ...blockReference,
        [{ ...currentSentence, frozenAt: new Date('2026-07-28T00:00:00Z') }],
        readyMedia,
      ],
    },
    {
      name: 'snapshot text가 다른 문장',
      input: {},
      rows: [
        draftVersion,
        ...blockReference,
        [{ ...currentSentence, originalText: 'เปลี่ยนแล้ว' }],
        readyMedia,
      ],
    },
    {
      name: '다른 media가 이미 연결된 문장',
      input: {},
      rows: [
        draftVersion,
        ...blockReference,
        [{ ...currentSentence, mediaAssetId: 'other-media-id' }],
        readyMedia,
      ],
    },
    {
      name: 'READY가 아닌 생성 media',
      input: {},
      rows: [draftVersion, ...blockReference, [currentSentence], []],
    },
  ])('$name은 stale target으로 닫는다', async ({ input, rows }) => {
    const fake = createTransaction(rows);
    const writer = new DrizzleTtsTargetAttachmentWriter();

    await expect(
      writer.attach(fake.transaction as never, {
        target,
        mediaAssetId,
        expectedRevision: target.revision,
        ...input,
      }),
    ).resolves.toBe('STALE_TARGET');
    expect(fake.updates).toEqual([]);
  });

  it('WORD 발음 target을 EXPRESSION kind로 위장하면 연결하지 않는다', async () => {
    const pronunciationTarget = {
      ...target,
      kind: 'EXPRESSION' as const,
      targetId: '50000000-0000-4000-8000-000000000001',
      text: 'ภาษา',
    };
    const fake = createTransaction([
      draftVersion,
      ...blockReference,
      [
        {
          id: pronunciationTarget.targetId,
          mediaAssetId: null,
          thai: pronunciationTarget.text,
          vocabularyKind: 'WORD',
        },
      ],
      readyMedia,
    ]);
    const writer = new DrizzleTtsTargetAttachmentWriter();

    await expect(
      writer.attach(fake.transaction as never, {
        target: pronunciationTarget,
        mediaAssetId,
        expectedRevision: pronunciationTarget.revision,
      }),
    ).resolves.toBe('STALE_TARGET');
    expect(fake.updates).toEqual([]);
  });

  it('DRAFT graph가 참조하는 EXPRESSION 발음은 kind와 text가 맞을 때 연결한다', async () => {
    const pronunciationTarget = {
      ...target,
      kind: 'EXPRESSION' as const,
      targetId: '50000000-0000-4000-8000-000000000001',
      text: 'ภาษาไทย',
    };
    const fake = createTransaction([
      draftVersion,
      ...blockReference,
      [
        {
          id: pronunciationTarget.targetId,
          mediaAssetId: null,
          thai: pronunciationTarget.text,
          vocabularyKind: 'EXPRESSION',
        },
      ],
      readyMedia,
    ]);
    const writer = new DrizzleTtsTargetAttachmentWriter();

    await expect(
      writer.attach(fake.transaction as never, {
        target: pronunciationTarget,
        mediaAssetId,
        expectedRevision: pronunciationTarget.revision,
      }),
    ).resolves.toBe('ATTACHED');
    expect(fake.updates[0]).toMatchObject({
      table: vocabularyPronunciations,
      values: { mediaAssetId },
    });
  });
});

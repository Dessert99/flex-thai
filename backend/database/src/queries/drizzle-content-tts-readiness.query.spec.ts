/** 문제 게시 TTS 준비 조회가 모든 문장과 참조 발음을 fail-closed로 집계하는지 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { DrizzleContentTtsReadinessQuery } from './drizzle-content-tts-readiness.query.js';

type QueryRows = Array<Record<string, unknown>>;

const createFake = (selectResults: QueryRows[]) => {
  const pending = [...selectResults];
  const conditions: unknown[] = [];
  const select = vi.fn(() => {
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);
    chain.where.mockImplementation((condition: unknown) => {
      conditions.push(condition);
      return chain;
    });
    chain.orderBy.mockImplementation(() =>
      Promise.resolve(pending.shift() ?? []),
    );
    return chain;
  });
  return { database: { select }, conditions };
};

const sqlParams = (condition: unknown): unknown[] =>
  new PgDialect().sqlToQuery(condition as never).params;

describe('DrizzleContentTtsReadinessQuery 게시 필수 음성 집계', () => {
  it('블록·해설·선택지 문장과 token·표현 발음을 중복 없이 안정 순서로 반환한다', async () => {
    const fake = createFake([
      [
        { sentenceVersionId: 'sentence-block' },
        { sentenceVersionId: 'sentence-explanation' },
      ],
      [
        {
          sentenceVersionId: 'sentence-option',
          spanSentenceVersionId: 'sentence-block',
        },
      ],
      [
        {
          targetId: 'sentence-block',
          mediaAssetId: 'media-sentence-block',
          mediaStatus: 'READY',
        },
        {
          targetId: 'sentence-explanation',
          mediaAssetId: null,
          mediaStatus: null,
        },
        {
          targetId: 'sentence-option',
          mediaAssetId: 'media-sentence-option',
          mediaStatus: 'UPLOADING',
        },
      ],
      [
        { pronunciationId: 'pronunciation-ready' },
        { pronunciationId: 'pronunciation-missing' },
      ],
      [
        { pronunciationId: 'pronunciation-rejected' },
        { pronunciationId: 'pronunciation-ready' },
      ],
      [
        {
          targetId: 'pronunciation-ready',
          mediaAssetId: 'media-pronunciation-ready',
          mediaStatus: 'READY',
        },
        {
          targetId: 'pronunciation-rejected',
          mediaAssetId: 'media-pronunciation-rejected',
          mediaStatus: 'REJECTED',
        },
      ],
    ]);
    const query = new DrizzleContentTtsReadinessQuery(fake.database as never);

    await expect(
      query.listRequiredTargets({
        questionId: 'question-id',
        versionId: 'question-version-id',
      }),
    ).resolves.toEqual([
      { targetId: 'pronunciation-missing', mediaStatus: 'MISSING' },
      { targetId: 'pronunciation-ready', mediaStatus: 'READY' },
      { targetId: 'pronunciation-rejected', mediaStatus: 'FAILED' },
      { targetId: 'sentence-block', mediaStatus: 'READY' },
      { targetId: 'sentence-explanation', mediaStatus: 'MISSING' },
      { targetId: 'sentence-option', mediaStatus: 'UPLOADING' },
    ]);
    expect(fake.database.select).toHaveBeenCalledTimes(6);
    expect(sqlParams(fake.conditions[0])).toEqual(
      expect.arrayContaining(['question-id', 'question-version-id']),
    );
    expect(sqlParams(fake.conditions[1])).toEqual(
      expect.arrayContaining(['question-id', 'question-version-id']),
    );
  });

  it('참조 문장 row 자체가 사라진 경우에도 누락 target으로 닫는다', async () => {
    const fake = createFake([
      [{ sentenceVersionId: 'missing-sentence' }],
      [],
      [],
      [],
      [],
      [],
    ]);
    const query = new DrizzleContentTtsReadinessQuery(fake.database as never);

    await expect(
      query.listRequiredTargets({
        questionId: 'question-id',
        versionId: 'question-version-id',
      }),
    ).resolves.toEqual([
      { targetId: 'missing-sentence', mediaStatus: 'MISSING' },
    ]);
  });

  it('서로 다른 target kind가 같은 UUID여도 누락 상태를 READY로 덮지 않는다', async () => {
    const fake = createFake([
      [{ sentenceVersionId: 'shared-target-id' }],
      [],
      [
        {
          targetId: 'shared-target-id',
          mediaAssetId: 'sentence-media-id',
          mediaStatus: 'READY',
        },
      ],
      [{ pronunciationId: 'shared-target-id' }],
      [],
      [],
    ]);
    const query = new DrizzleContentTtsReadinessQuery(fake.database as never);

    await expect(
      query.listRequiredTargets({
        questionId: 'question-id',
        versionId: 'question-version-id',
      }),
    ).resolves.toEqual([
      { targetId: 'shared-target-id', mediaStatus: 'READY' },
      { targetId: 'shared-target-id', mediaStatus: 'MISSING' },
    ]);
  });

  it('필수 대상이 하나도 없으면 빈 준비 목록을 반환한다', async () => {
    const fake = createFake([[], []]);
    const query = new DrizzleContentTtsReadinessQuery(fake.database as never);

    await expect(
      query.listRequiredTargets({
        questionId: 'question-id',
        versionId: 'question-version-id',
      }),
    ).resolves.toEqual([]);
    expect(fake.database.select).toHaveBeenCalledTimes(2);
  });
});

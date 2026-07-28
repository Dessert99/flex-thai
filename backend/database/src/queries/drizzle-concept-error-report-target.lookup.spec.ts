/** 개념 오류 신고 대상이 현재 공개 graph에 한정되는지 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { DrizzleConceptErrorReportTargetLookup } from './drizzle-concept-error-report-target.lookup.js';

const createSelectDatabase = (responses: unknown[][]) => {
  const orderByCalls: unknown[][] = [];
  const whereCalls: unknown[] = [];
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'innerJoin', 'where', 'limit']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.where = vi.fn((condition: unknown) => {
      whereCalls.push(condition);
      return chain;
    });
    chain.orderBy = vi.fn((...order: unknown[]) => {
      orderByCalls.push(order);
      return chain;
    });
    chain.then = (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(responses.shift() ?? []).then(resolve);
    return chain;
  });
  return { orderByCalls, select, whereCalls };
};

const publishedConcept = {
  conceptId: '11111111-1111-4111-8111-111111111111',
  conceptVersionId: '22222222-2222-4222-8222-222222222222',
  version: 3,
  title: '태국어 기본 어순',
  summary: '주어와 서술어의 기본 순서를 익힙니다.',
};

const publishedSentence = {
  sentenceId: '33333333-3333-4333-8333-333333333333',
  sentenceVersionId: '44444444-4444-4444-8444-444444444444',
  version: 2,
  originalText: 'ฉันเรียนภาษาไทย',
  translationKo: '나는 태국어를 공부한다',
  pronunciationKo: '찬 리안 파싸 타이',
  mediaAssetId: '55555555-5555-4555-8555-555555555555',
};

describe('DrizzleConceptErrorReportTargetLookup', () => {
  it('현재 게시 개념 버전만 개념 전체 대상으로 해석한다', async () => {
    const database = createSelectDatabase([[publishedConcept]]);
    const lookup = new DrizzleConceptErrorReportTargetLookup(database as never);

    await expect(
      lookup.resolve({
        kind: 'CONCEPT',
        conceptId: publishedConcept.conceptId,
        conceptVersionId: publishedConcept.conceptVersionId,
        blockId: null,
      }),
    ).resolves.toEqual({
      reference: {
        kind: 'CONCEPT',
        contentId: publishedConcept.conceptId,
        contentVersionId: publishedConcept.conceptVersionId,
        questionVersionId: null,
        sentenceVersionId: null,
        mediaAssetId: null,
        locationId: null,
      },
      snapshot: {
        title: '태국어 기본 어순',
        primaryText: '주어와 서술어의 기본 순서를 익힙니다.',
        secondaryText: null,
        versionLabel: '버전 3',
        locationLabel: '개념 상세',
        audioAssetId: null,
      },
    });

    const compiled = new PgDialect().sqlToQuery(
      database.whereCalls[0] as never,
    );
    expect(compiled.params).toEqual(
      expect.arrayContaining([
        publishedConcept.conceptId,
        publishedConcept.conceptVersionId,
      ]),
    );
    expect(
      compiled.params.filter((value) => value === 'PUBLISHED'),
    ).toHaveLength(2);
    expect(database.orderByCalls).toHaveLength(1);
  });

  it('요청 block이 같은 현재 게시 버전에 속할 때만 위치 대상으로 해석한다', async () => {
    const blockId = '66666666-6666-4666-8666-666666666666';
    const database = createSelectDatabase([
      [publishedConcept],
      [{ id: blockId, heading: '핵심 규칙', position: 1 }],
    ]);
    const lookup = new DrizzleConceptErrorReportTargetLookup(database as never);

    await expect(
      lookup.resolve({
        kind: 'CONCEPT',
        conceptId: publishedConcept.conceptId,
        conceptVersionId: publishedConcept.conceptVersionId,
        blockId,
      }),
    ).resolves.toMatchObject({
      reference: { locationId: blockId },
      snapshot: {
        primaryText: '핵심 규칙',
        secondaryText: '주어와 서술어의 기본 순서를 익힙니다.',
        locationLabel: '개념 블록 2',
      },
    });

    const compiled = new PgDialect().sqlToQuery(
      database.whereCalls[1] as never,
    );
    expect(compiled.params).toEqual(
      expect.arrayContaining([blockId, publishedConcept.conceptVersionId]),
    );
    expect(database.orderByCalls).toHaveLength(2);
  });

  it('다른 버전의 block은 현재 개념 위치로 사용하지 않는다', async () => {
    const database = createSelectDatabase([[publishedConcept], []]);
    const lookup = new DrizzleConceptErrorReportTargetLookup(database as never);

    await expect(
      lookup.resolve({
        kind: 'CONCEPT',
        conceptId: publishedConcept.conceptId,
        conceptVersionId: publishedConcept.conceptVersionId,
        blockId: '77777777-7777-4777-8777-777777777777',
      }),
    ).resolves.toBeNull();
  });

  it('공개 예시의 frozen 문장과 READY 음성만 문장 대상으로 해석한다', async () => {
    const database = createSelectDatabase([[publishedSentence]]);
    const lookup = new DrizzleConceptErrorReportTargetLookup(database as never);

    await expect(
      lookup.resolveSentence({
        sentenceVersionId: publishedSentence.sentenceVersionId,
        tokenPosition: null,
      }),
    ).resolves.toEqual({
      reference: {
        kind: 'SENTENCE',
        contentId: publishedSentence.sentenceId,
        contentVersionId: publishedSentence.sentenceVersionId,
        questionVersionId: null,
        sentenceVersionId: publishedSentence.sentenceVersionId,
        mediaAssetId: publishedSentence.mediaAssetId,
        locationId: null,
      },
      snapshot: {
        title: 'ฉันเรียนภาษาไทย',
        primaryText: '나는 태국어를 공부한다',
        secondaryText: '찬 리안 파싸 타이',
        versionLabel: '버전 2',
        locationLabel: '문장',
        audioAssetId: publishedSentence.mediaAssetId,
      },
    });

    const compiled = new PgDialect().sqlToQuery(
      database.whereCalls[0] as never,
    );
    expect(compiled.params).toEqual(
      expect.arrayContaining([
        publishedSentence.sentenceVersionId,
        'THAI_EXAMPLES',
        'READY',
      ]),
    );
    expect(
      compiled.params.filter((value) => value === 'PUBLISHED'),
    ).toHaveLength(2);
    expect(compiled.sql).toContain('is not null');
    expect(database.orderByCalls).toHaveLength(1);
  });

  it('게시 문장 조회 결과의 음성 ID가 null이면 대상을 fail-closed 처리한다', async () => {
    const database = createSelectDatabase([
      [{ ...publishedSentence, mediaAssetId: null }],
    ]);
    const lookup = new DrizzleConceptErrorReportTargetLookup(database as never);

    await expect(
      lookup.resolveSentence({
        sentenceVersionId: publishedSentence.sentenceVersionId,
        tokenPosition: null,
      }),
    ).resolves.toBeNull();
  });

  it('요청 token position이 문장에 없으면 대상을 거부한다', async () => {
    const database = createSelectDatabase([[publishedSentence], []]);
    const lookup = new DrizzleConceptErrorReportTargetLookup(database as never);

    await expect(
      lookup.resolveSentence({
        sentenceVersionId: publishedSentence.sentenceVersionId,
        tokenPosition: 2,
      }),
    ).resolves.toBeNull();

    const compiled = new PgDialect().sqlToQuery(
      database.whereCalls[1] as never,
    );
    expect(compiled.params).toEqual(
      expect.arrayContaining([publishedSentence.sentenceVersionId, 2]),
    );
  });

  it('공개 문장의 READY 음성을 canonical audio 대상으로 해석한다', async () => {
    const database = createSelectDatabase([[publishedSentence]]);
    const lookup = new DrizzleConceptErrorReportTargetLookup(database as never);

    await expect(
      lookup.resolveSentenceAudio(publishedSentence.sentenceVersionId),
    ).resolves.toEqual({
      reference: {
        kind: 'AUDIO',
        contentId: publishedSentence.mediaAssetId,
        contentVersionId: publishedSentence.sentenceVersionId,
        questionVersionId: null,
        sentenceVersionId: publishedSentence.sentenceVersionId,
        mediaAssetId: publishedSentence.mediaAssetId,
        locationId: null,
      },
      snapshot: {
        title: 'ฉันเรียนภาษาไทย 음성',
        primaryText: '나는 태국어를 공부한다',
        secondaryText: '찬 리안 파싸 타이',
        versionLabel: '버전 2',
        locationLabel: '문장 음성',
        audioAssetId: publishedSentence.mediaAssetId,
      },
    });
  });
});

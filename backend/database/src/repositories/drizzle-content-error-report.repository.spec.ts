/** 콘텐츠 오류 신고 adapter의 concept 격리와 원자 생성 저장을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleContentErrorReportRepository } from './drizzle-content-error-report.repository.js';

const createSelectDatabase = (responses: unknown[][]) => {
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'limit']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(responses.shift() ?? []).then(resolve);
    return chain;
  });
  return { select };
};

describe('DrizzleContentErrorReportRepository', () => {
  it('concept schema를 알지 않고 주입 lookup으로만 대상을 해석한다', async () => {
    const resolved = {
      reference: {
        kind: 'CONCEPT' as const,
        contentId: 'concept-id',
        contentVersionId: 'version-id',
        questionVersionId: null,
        sentenceVersionId: null,
        mediaAssetId: null,
        locationId: null,
      },
      snapshot: {
        title: '문법',
        primaryText: '기본 어순',
        secondaryText: null,
        versionLabel: '버전 1',
        locationLabel: '개념 상세',
        audioAssetId: null,
      },
    };
    const lookup = { resolve: vi.fn().mockResolvedValue(resolved) };
    const repository = new DrizzleContentErrorReportRepository(
      {} as never,
      lookup,
    );
    await expect(
      repository.resolve({
        kind: 'CONCEPT',
        conceptId: 'concept-id',
        conceptVersionId: 'version-id',
        blockId: null,
      }),
    ).resolves.toEqual(resolved);
    expect(lookup.resolve).toHaveBeenCalledOnce();
  });

  it('concept lookup이 연결되지 않으면 대상을 사용할 수 없다', async () => {
    const repository = new DrizzleContentErrorReportRepository({} as never);
    await expect(
      repository.resolve({
        kind: 'CONCEPT',
        conceptId: 'concept-id',
        conceptVersionId: 'version-id',
        blockId: null,
      }),
    ).resolves.toBeNull();
  });

  it('문제 문장 관계가 없으면 sentenceVersionId를 저장하지 않는다', async () => {
    const database = createSelectDatabase([[{ version: 1 }], []]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'QUESTION',
        questionId: 'question-id',
        questionVersionId: 'version-id',
        blockId: null,
        sentenceVersionId: 'sentence-id',
      }),
    ).resolves.toBeNull();
  });

  it('어휘 뜻 소유 관계가 다르면 대상을 거부한다', async () => {
    const database = createSelectDatabase([[{ thai: 'ไทย' }], []]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'VOCABULARY',
        vocabularyId: 'vocabulary-id',
        meaningId: 'other-meaning-id',
        pronunciationId: null,
      }),
    ).resolves.toBeNull();
  });

  it('문장 노출 관계가 없으면 대상을 거부한다', async () => {
    const database = createSelectDatabase([
      [
        {
          id: 'sentence-version-id',
          sentenceId: 'sentence-id',
          version: 1,
          originalText: 'ไทย',
          translationKo: '태국어',
          pronunciationKo: '타이',
          mediaAssetId: 'media-id',
          frozenAt: new Date(),
        },
      ],
      [],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'SENTENCE',
        sentenceVersionId: 'sentence-version-id',
        tokenPosition: null,
      }),
    ).resolves.toBeNull();
  });

  it('READY가 아닌 어휘 음성을 거부한다', async () => {
    const database = createSelectDatabase([
      [
        {
          vocabularyId: 'vocabulary-id',
          thai: 'ไทย',
          pronunciation: '타이',
          mediaAssetId: 'media-id',
          mediaStatus: 'REJECTED',
        },
      ],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'AUDIO',
        source: { kind: 'VOCABULARY', pronunciationId: 'pronunciation-id' },
      }),
    ).resolves.toBeNull();
  });
});

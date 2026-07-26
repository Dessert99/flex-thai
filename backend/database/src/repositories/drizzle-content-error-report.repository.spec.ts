/** 콘텐츠 오류 신고 adapter의 concept 격리와 원자 생성 저장을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleContentErrorReportRepository } from './drizzle-content-error-report.repository.js';

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
});

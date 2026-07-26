/** AI 어휘 조회가 MERGED 대표와 stable 의심 중복을 반환하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleVocabularyProductionLookup } from './drizzle-vocabulary-production.lookup.js';

describe('DrizzleVocabularyProductionLookup', () => {
  it('MERGED exact 어휘의 최종 대표와 뜻을 반환한다', async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'source-id',
          status: 'MERGED',
          mergedIntoVocabularyId: 'representative-id',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'representative-id',
          status: 'PUBLISHED',
          mergedIntoVocabularyId: null,
        },
      ]);
    const whereVocabulary = vi.fn(() => ({ limit }));
    const fromVocabulary = vi.fn(() => ({ where: whereVocabulary }));
    const whereMeanings = vi
      .fn()
      .mockResolvedValue([{ meaningKo: '안녕하세요' }]);
    const fromMeanings = vi.fn(() => ({ where: whereMeanings }));
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({ from: fromVocabulary }))
      .mockImplementationOnce(() => ({ from: fromVocabulary }))
      .mockImplementationOnce(() => ({ from: fromMeanings }));
    const lookup = new DrizzleVocabularyProductionLookup({ select } as never);

    await expect(lookup.findExact('สวัสดี')).resolves.toEqual({
      vocabularyId: 'representative-id',
      meanings: [{ meaningKo: '안녕하세요' }],
    });
  });

  it('의심 중복을 거리와 ID 순으로 최대 5개 반환한다', async () => {
    const rows = [
      { id: 'b', normalizedThai: 'กา', status: 'DRAFT' },
      { id: 'a', normalizedThai: 'ขา', status: 'PUBLISHED' },
      { id: 'far', normalizedThai: 'ยาวมาก', status: 'HIDDEN' },
    ];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const lookup = new DrizzleVocabularyProductionLookup({ select } as never);

    await expect(
      lookup.findSuspected({
        normalizedThai: 'คา',
        maxCodePointDistance: 1,
        limit: 5,
      }),
    ).resolves.toEqual([
      { vocabularyId: 'a', normalizedThai: 'ขา', codePointDistance: 1 },
      { vocabularyId: 'b', normalizedThai: 'กา', codePointDistance: 1 },
    ]);
  });
});

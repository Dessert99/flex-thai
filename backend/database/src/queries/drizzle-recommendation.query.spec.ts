import { describe, expect, it, vi } from 'vitest';
import {
  calculateRecommendations,
  DrizzleRecommendationQuery,
  type VocabularyRecommendationCandidate,
} from './drizzle-recommendation.query.js';
const vocabulary = (
  id: string,
  date: string,
  inWordbook = false,
): VocabularyRecommendationCandidate => ({
  id,
  thai: 'สวัสดี',
  kind: 'WORD',
  publishedAt: date,
  publishedToday: false,
  inWordbook,
});
describe('어휘 추천', () => {
  it('신호가 부족하면 최신 게시 어휘를 세 개까지 보여준다', () => {
    const result = calculateRecommendations({
      meaningfulSignalCount: 0,
      vocabularies: [
        vocabulary('a', '2026-09-01', true),
        vocabulary('b', '2026-09-02'),
        vocabulary('c', '2026-09-03'),
        vocabulary('d', '2026-09-04'),
      ],
    });
    expect(result.mode).toBe('FALLBACK');
    expect(result.vocabularies.map((v) => v.id)).toEqual(['d', 'c', 'b']);
    expect(result).not.toHaveProperty('questions');
  });
  it('개인화 후 단어장 어휘를 우선하며 같은 점수는 최신순을 유지한다', () => {
    const result = calculateRecommendations({
      meaningfulSignalCount: 5,
      vocabularies: [
        vocabulary('a', '2026-09-01', true),
        vocabulary('b', '2026-09-03'),
        vocabulary('c', '2026-09-02', true),
      ],
    });
    expect(result.vocabularies.map((v) => [v.id, v.reasonCode])).toEqual([
      ['c', 'IN_WORDBOOK'],
      ['a', 'IN_WORDBOOK'],
      ['b', 'RECENTLY_PUBLISHED'],
    ]);
  });
  it('비어 있는 DB에서도 공개 응답을 만들고 문제 기록은 조회하지 않는다', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const result = await new DrizzleRecommendationQuery({ execute }).getForUser(
      'user-id',
    );
    expect(result.vocabularies).toEqual([]);
    expect(result.meaningfulSignalCount).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
  });
});

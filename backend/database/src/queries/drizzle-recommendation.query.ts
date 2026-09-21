/** 게시 어휘와 내 단어장을 바탕으로 학습 홈 콘텐츠를 조회한다. */
import { sql, type SQL } from 'drizzle-orm';
interface RecommendationReadDatabase {
  execute(query: SQL): Promise<unknown>;
}
export interface VocabularyRecommendationCandidate {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  publishedAt: Date | string;
  publishedToday: boolean;
  inWordbook: boolean;
}
export interface RecommendationCalculationInput {
  meaningfulSignalCount: number;
  vocabularies: VocabularyRecommendationCandidate[];
}
const activationThreshold = 5;
export const calculateRecommendations = (
  input: RecommendationCalculationInput,
) => {
  const personalized = input.meaningfulSignalCount >= activationThreshold;
  const recent = [...input.vocabularies].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  const summary = (v: VocabularyRecommendationCandidate) => ({
    id: v.id,
    thai: v.thai,
    kind: v.kind,
    publishedAt: new Date(v.publishedAt).toISOString(),
  });
  const ranked = personalized
    ? [...recent].sort((a, b) => Number(b.inWordbook) - Number(a.inWordbook))
    : recent;
  return {
    mode: personalized ? ('PERSONALIZED' as const) : ('FALLBACK' as const),
    meaningfulSignalCount: input.meaningfulSignalCount,
    activationThreshold,
    publishedToday: {
      vocabularies: recent
        .filter((v) => v.publishedToday)
        .slice(0, 3)
        .map(summary),
    },
    newContent: { vocabularies: recent.slice(0, 3).map(summary) },
    vocabularies: ranked.slice(0, 3).map((v) => ({
      id: v.id,
      thai: v.thai,
      kind: v.kind,
      reasonCode:
        personalized && v.inWordbook
          ? ('IN_WORDBOOK' as const)
          : ('RECENTLY_PUBLISHED' as const),
      reason:
        personalized && v.inWordbook
          ? '내 단어장에 담은 어휘예요.'
          : '최근 게시된 어휘예요.',
    })),
  };
};
export type RecommendationProjection = ReturnType<
  typeof calculateRecommendations
>;
const rowsOf = <T>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : typeof value === 'object' &&
        value !== null &&
        'rows' in value &&
        Array.isArray(value.rows)
      ? (value.rows as T[])
      : [];
export class DrizzleRecommendationQuery {
  constructor(private readonly database: RecommendationReadDatabase) {}
  async getForUser(userId: string): Promise<RecommendationProjection> {
    const result = await this.database.execute(
      sql`select v.id, v.thai, v.kind, v.published_at as "publishedAt", (v.published_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date as "publishedToday", exists(select 1 from wordbook_items wi join wordbooks w on w.id = wi.wordbook_id where wi.vocabulary_id = v.id and w.user_id = ${userId}) as "inWordbook" from vocabularies v where v.status = 'PUBLISHED' and v.published_at is not null`,
    );
    const vocabularies = rowsOf<VocabularyRecommendationCandidate>(result);
    return calculateRecommendations({
      meaningfulSignalCount: vocabularies.filter((v) => v.inWordbook).length,
      vocabularies,
    });
  }
}

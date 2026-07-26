/** 추천 신호 점수·활성화·결정적 정렬을 원시 후보로 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildRecommendationResult,
  DrizzleRecommendationQuery,
  type QuestionRecommendationCandidate,
  type VocabularyRecommendationCandidate,
} from './drizzle-recommendation.query.js';

const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const question = (
  id: number,
  publishedAt: string,
  signals: Partial<
    Pick<
      QuestionRecommendationCandidate,
      | 'saved'
      | 'firstIncorrect'
      | 'practiceIncorrectVocabulary'
      | 'sameIncorrectType'
      | 'savedQuestionVocabulary'
      | 'firstCorrect'
    >
  > = {},
): QuestionRecommendationCandidate => ({
  questionId: uuid(id),
  questionVersionId: uuid(id + 100),
  questionTypeId: uuid(id + 200),
  questionTypeSlug: `type-${id}`,
  questionTypeDisplayName: `문제 유형 ${id}`,
  skill: 'READING',
  difficulty: 2,
  publishedAt,
  saved: false,
  firstIncorrect: false,
  practiceIncorrectVocabulary: false,
  sameIncorrectType: false,
  savedQuestionVocabulary: false,
  firstCorrect: false,
  ...signals,
});

const vocabulary = (
  id: number,
  publishedAt: string,
  signals: Partial<
    Pick<
      VocabularyRecommendationCandidate,
      | 'inWordbook'
      | 'practiceIncorrect'
      | 'firstIncorrectQuestion'
      | 'savedQuestion'
    >
  > = {},
): VocabularyRecommendationCandidate => ({
  id: uuid(id),
  thai: `คำ-${id}`,
  kind: 'WORD',
  publishedAt,
  inWordbook: false,
  practiceIncorrect: false,
  firstIncorrectQuestion: false,
  savedQuestion: false,
  ...signals,
});

describe('개인 추천 점수 계산', () => {
  it('신호가 4개이면 최근 게시 시각과 ID 순서로 fallback을 반환한다', () => {
    const result = buildRecommendationResult({
      meaningfulSignalCount: 4,
      questions: [
        question(2, '2026-07-25T00:00:00.000Z'),
        question(1, '2026-07-25T00:00:00.000Z'),
        question(3, '2026-07-26T00:00:00.000Z'),
      ],
      vocabularies: [
        vocabulary(5, '2026-07-25T00:00:00.000Z'),
        vocabulary(4, '2026-07-26T00:00:00.000Z'),
      ],
    });

    expect(result.mode).toBe('FALLBACK');
    expect(result.questions.map(({ questionId }) => questionId)).toEqual([
      uuid(3),
      uuid(1),
      uuid(2),
    ]);
    expect(result.questions[0]?.reasonCode).toBe('RECENTLY_PUBLISHED');
    expect(result.vocabularies.map(({ id }) => id)).toEqual([uuid(4), uuid(5)]);
  });

  it('신호가 5개이면 모든 기여를 합산하고 가장 큰 기여 이유를 공개한다', () => {
    const result = buildRecommendationResult({
      meaningfulSignalCount: 5,
      questions: [
        question(1, '2026-07-24T00:00:00.000Z', {
          saved: true,
          firstCorrect: true,
        }),
        question(2, '2026-07-23T00:00:00.000Z', {
          firstIncorrect: true,
          sameIncorrectType: true,
        }),
        question(3, '2026-07-22T00:00:00.000Z', {
          practiceIncorrectVocabulary: true,
        }),
        question(4, '2026-07-26T00:00:00.000Z', {
          sameIncorrectType: true,
        }),
      ],
      vocabularies: [
        vocabulary(11, '2026-07-23T00:00:00.000Z', {
          inWordbook: true,
        }),
        vocabulary(12, '2026-07-24T00:00:00.000Z', {
          practiceIncorrect: true,
          savedQuestion: true,
        }),
        vocabulary(13, '2026-07-25T00:00:00.000Z', {
          firstIncorrectQuestion: true,
        }),
        vocabulary(14, '2026-07-26T00:00:00.000Z', {
          savedQuestion: true,
        }),
      ],
    });

    expect(result.mode).toBe('PERSONALIZED');
    expect(
      result.questions.map(({ questionId, reasonCode }) => ({
        questionId,
        reasonCode,
      })),
    ).toEqual([
      { questionId: uuid(2), reasonCode: 'FIRST_INCORRECT_RETRY' },
      { questionId: uuid(1), reasonCode: 'SAVED_QUESTION' },
      {
        questionId: uuid(3),
        reasonCode: 'PRACTICE_MISSED_VOCABULARY',
      },
    ]);
    expect(
      result.vocabularies.map(({ id, reasonCode }) => ({ id, reasonCode })),
    ).toEqual([
      { id: uuid(12), reasonCode: 'PRACTICE_INCORRECT' },
      { id: uuid(11), reasonCode: 'IN_WORDBOOK' },
      {
        id: uuid(13),
        reasonCode: 'FIRST_INCORRECT_QUESTION_VOCABULARY',
      },
    ]);
  });

  it('양수 후보가 한 종류라도 없으면 두 목록을 함께 fallback한다', () => {
    const result = buildRecommendationResult({
      meaningfulSignalCount: 5,
      questions: [question(1, '2026-07-26T00:00:00.000Z')],
      vocabularies: [
        vocabulary(2, '2026-07-26T00:00:00.000Z', { inWordbook: true }),
      ],
    });

    expect(result.mode).toBe('FALLBACK');
    expect(result.questions[0]?.reasonCode).toBe('RECENTLY_PUBLISHED');
    expect(result.vocabularies[0]?.reasonCode).toBe('RECENTLY_PUBLISHED');
  });

  it('같은 점수는 게시 시각과 ID로 정렬하고 낮은 기여 code도 보존한다', () => {
    const result = buildRecommendationResult({
      meaningfulSignalCount: 5,
      questions: [
        question(2, '2026-07-26T00:00:00.000Z', {
          sameIncorrectType: true,
        }),
        question(1, '2026-07-26T00:00:00.000Z', {
          sameIncorrectType: true,
        }),
        question(3, '2026-07-25T00:00:00.000Z', {
          savedQuestionVocabulary: true,
        }),
      ],
      vocabularies: [
        vocabulary(4, '2026-07-26T00:00:00.000Z', {
          savedQuestion: true,
        }),
      ],
    });

    expect(
      result.questions.map(({ questionId, reasonCode }) => ({
        questionId,
        reasonCode,
      })),
    ).toEqual([
      { questionId: uuid(1), reasonCode: 'SIMILAR_QUESTION_TYPE' },
      { questionId: uuid(2), reasonCode: 'SIMILAR_QUESTION_TYPE' },
      { questionId: uuid(3), reasonCode: 'SAVED_QUESTION_VOCABULARY' },
    ]);
    expect(result.vocabularies[0]?.reasonCode).toBe(
      'SAVED_QUESTION_VOCABULARY',
    );
  });
});

describe('DrizzleRecommendationQuery', () => {
  it('DB가 distinct 계산한 신호와 현재 게시 후보를 하나의 추천 결과로 조립한다', async () => {
    const database = {
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ meaningfulSignalCount: '5' }])
        .mockResolvedValueOnce([
          question(1, '2026-07-26T00:00:00.000Z', {
            saved: true,
          }),
        ])
        .mockResolvedValueOnce([
          vocabulary(2, '2026-07-26T00:00:00.000Z', {
            inWordbook: true,
          }),
        ]),
    };

    const result = await new DrizzleRecommendationQuery(database).getForUser(
      uuid(900),
    );

    expect(result).toMatchObject({
      mode: 'PERSONALIZED',
      meaningfulSignalCount: 5,
      questions: [{ reasonCode: 'SAVED_QUESTION' }],
      vocabularies: [{ reasonCode: 'IN_WORDBOOK' }],
    });
  });

  it('한 연결에서 동시에 query할 수 없는 PostgreSQL client도 지원한다', async () => {
    let active = false;
    let call = 0;
    const results = [
      [{ meaningfulSignalCount: '0' }],
      [question(1, '2026-07-26T00:00:00.000Z')],
      [vocabulary(2, '2026-07-26T00:00:00.000Z')],
    ];
    const database = {
      execute: async () => {
        if (active) throw new Error('CONCURRENT_QUERY');
        active = true;
        const result = results[call];
        call += 1;
        await Promise.resolve();
        active = false;
        return result;
      },
    };

    await expect(
      new DrizzleRecommendationQuery(database as never).getForUser(uuid(901)),
    ).resolves.toMatchObject({ mode: 'FALLBACK' });
  });
});

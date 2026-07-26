/** 단어 연습 요청 검증과 미답 정답 비노출·완료 결과 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  createVocabularyPracticeRequestSchema,
  practiceQuestionSchema,
  vocabularyPracticeAnswerResponseSchema,
  vocabularyPracticeSessionResponseSchema,
} from './vocabulary-practice.js';

const ids = {
  session: '00000000-0000-4000-8000-000000000201',
  vocabulary: '00000000-0000-4000-8000-000000000202',
  meaning: '00000000-0000-4000-8000-000000000203',
  pronunciation: '00000000-0000-4000-8000-000000000204',
  question: '00000000-0000-4000-8000-000000000205',
  option: '00000000-0000-4000-8000-000000000206',
  secondOption: '00000000-0000-4000-8000-000000000207',
  thirdOption: '00000000-0000-4000-8000-000000000208',
  fourthOption: '00000000-0000-4000-8000-000000000209',
} as const;

const card = {
  id: ids.vocabulary,
  thai: 'เรียน',
  kind: 'WORD',
  meanings: [
    {
      id: ids.meaning,
      meaningKo: '배우다',
      partOfSpeech: '동사',
      difficulty: 1,
      contextNote: null,
    },
  ],
  pronunciations: [
    {
      id: ids.pronunciation,
      pronunciationKo: '리안',
      toneMarks: 'M',
      audioUrl: 'https://media.example.com/practice/learn.mp3?Expires=300',
    },
  ],
} as const;

const question = {
  id: ids.question,
  position: 1,
  vocabularyId: ids.vocabulary,
  meaningId: ids.meaning,
  mode: 'THAI_TO_MEANING',
  prompt: { type: 'TEXT', text: 'เรียน' },
  options: [
    { id: ids.option, label: '배우다' },
    { id: ids.secondOption, label: '가르치다' },
    { id: ids.thirdOption, label: '읽다' },
    { id: ids.fourthOption, label: '쓰다' },
  ],
} as const;

describe('단어 연습 생성 요청 계약', () => {
  it('검색 선택과 단어장 출처를 구분해 검증한다', () => {
    expect(
      createVocabularyPracticeRequestSchema.parse({
        source: {
          type: 'SEARCH_SELECTION',
          vocabularyIds: [ids.vocabulary],
        },
        modes: ['THAI_TO_MEANING', 'AUDIO_TO_MEANING'],
        questionCount: 10,
        order: 'RANDOM',
      }),
    ).toEqual({
      source: {
        type: 'SEARCH_SELECTION',
        vocabularyIds: [ids.vocabulary],
      },
      modes: ['THAI_TO_MEANING', 'AUDIO_TO_MEANING'],
      questionCount: 10,
      order: 'RANDOM',
    });
  });

  it('중복 source ID·빈 mode·중복 mode·지원하지 않는 문항 수를 거부한다', () => {
    const base = {
      source: {
        type: 'SEARCH_SELECTION',
        vocabularyIds: [ids.vocabulary],
      },
      modes: ['THAI_TO_MEANING'],
      questionCount: 10,
      order: 'SOURCE',
    } as const;

    expect(() =>
      createVocabularyPracticeRequestSchema.parse({
        ...base,
        source: {
          type: 'SEARCH_SELECTION',
          vocabularyIds: [ids.vocabulary, ids.vocabulary],
        },
      }),
    ).toThrow();
    expect(() =>
      createVocabularyPracticeRequestSchema.parse({ ...base, modes: [] }),
    ).toThrow();
    expect(() =>
      createVocabularyPracticeRequestSchema.parse({
        ...base,
        modes: ['THAI_TO_MEANING', 'THAI_TO_MEANING'],
      }),
    ).toThrow();
    expect(() =>
      createVocabularyPracticeRequestSchema.parse({
        ...base,
        questionCount: 30,
      }),
    ).toThrow();
  });

  it('알 수 없는 요청 필드를 거부한다', () => {
    expect(() =>
      createVocabularyPracticeRequestSchema.parse({
        source: { type: 'WORDBOOK', wordbookId: ids.vocabulary },
        modes: ['MEANING_TO_THAI'],
        questionCount: 'ALL',
        order: 'SOURCE',
        recommendation: true,
      }),
    ).toThrow();
  });
});

describe('단어 연습 공개 응답 계약', () => {
  it('미답 문항은 correctOptionId를 공개하지 않는다', () => {
    expect(practiceQuestionSchema.parse(question)).toEqual(question);
    expect(
      practiceQuestionSchema.safeParse({
        ...question,
        correctOptionId: ids.option,
      }).success,
    ).toBe(false);
  });

  it('문항은 서로 다른 UUID와 label의 선택지 네 개만 허용한다', () => {
    expect(() =>
      practiceQuestionSchema.parse({
        ...question,
        options: question.options.slice(0, 3),
      }),
    ).toThrow();
    expect(() =>
      practiceQuestionSchema.parse({
        ...question,
        options: [
          ...question.options.slice(0, 3),
          { id: ids.fourthOption, label: '배우다' },
        ],
      }),
    ).toThrow();
  });

  it('진행 중 세션은 결과를 금지하고 완료 세션은 결과를 요구한다', () => {
    const activeSession = {
      id: ids.session,
      sourceLabel: '공용 검색',
      modes: ['THAI_TO_MEANING'],
      questionCount: 1,
      order: 'SOURCE',
      status: 'ACTIVE',
      startedAt: '2026-07-26T00:00:00.000Z',
      completedAt: null,
      cards: [card],
      questions: [question],
    } as const;
    expect(
      vocabularyPracticeSessionResponseSchema.parse(activeSession),
    ).toEqual(activeSession);
    expect(() =>
      vocabularyPracticeSessionResponseSchema.parse({
        ...activeSession,
        result: {
          total: { correct: 0, incorrect: 0 },
          byMode: [],
          incorrectCards: [],
        },
      }),
    ).toThrow();
    expect(() =>
      vocabularyPracticeSessionResponseSchema.parse({
        ...activeSession,
        status: 'COMPLETED',
        completedAt: '2026-07-26T00:10:00.000Z',
      }),
    ).toThrow();
  });

  it('완료 세션과 답 피드백만 정답과 원시 정오 결과를 공개한다', () => {
    const completedSession = {
      id: ids.session,
      sourceLabel: '내 단어장',
      modes: ['THAI_TO_MEANING'],
      questionCount: 1,
      order: 'SOURCE',
      status: 'COMPLETED',
      startedAt: '2026-07-26T00:00:00.000Z',
      completedAt: '2026-07-26T00:10:00.000Z',
      cards: [card],
      questions: [question],
      result: {
        total: { correct: 1, incorrect: 0 },
        byMode: [{ mode: 'THAI_TO_MEANING', correct: 1, incorrect: 0 }],
        incorrectCards: [],
      },
    } as const;
    expect(
      vocabularyPracticeSessionResponseSchema.parse(completedSession),
    ).toEqual(completedSession);

    const answer = {
      questionId: ids.question,
      selectedOptionId: ids.option,
      selectedLabel: '배우다',
      isCorrect: true,
      correctOptionId: ids.option,
      card,
      sessionCompleted: true,
      answeredAt: '2026-07-26T00:10:00.000Z',
    } as const;
    expect(vocabularyPracticeAnswerResponseSchema.parse(answer)).toEqual(
      answer,
    );
  });

  it('카드 응답의 storage key를 거부한다', () => {
    expect(() =>
      vocabularyPracticeAnswerResponseSchema.parse({
        questionId: ids.question,
        selectedOptionId: ids.option,
        selectedLabel: '배우다',
        isCorrect: true,
        correctOptionId: ids.option,
        card: {
          ...card,
          pronunciations: [
            { ...card.pronunciations[0], storageKey: 'private/learn.mp3' },
          ],
        },
        sessionCompleted: false,
        answeredAt: '2026-07-26T00:10:00.000Z',
      }),
    ).toThrow();
  });
});

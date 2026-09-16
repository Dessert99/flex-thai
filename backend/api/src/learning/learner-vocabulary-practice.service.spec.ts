import { describe, expect, it, vi } from 'vitest';
import { LearnerVocabularyPracticeService } from './learner-vocabulary-practice.service.js';

const ids = {
  session: '00000000-0000-4000-8000-000000000801',
  user: '00000000-0000-4000-8000-000000000802',
  vocabulary: '00000000-0000-4000-8000-000000000803',
  meaning: '00000000-0000-4000-8000-000000000804',
  pronunciation: '00000000-0000-4000-8000-000000000805',
  question: '00000000-0000-4000-8000-000000000807',
  option: '00000000-0000-4000-8000-000000000808',
  secondOption: '00000000-0000-4000-8000-000000000809',
  thirdOption: '00000000-0000-4000-8000-000000000810',
  fourthOption: '00000000-0000-4000-8000-000000000811',
  answer: '00000000-0000-4000-8000-000000000812',
  client: '00000000-0000-4000-8000-000000000813',
} as const;
const now = new Date('2026-07-26T00:00:00.000Z');
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
    },
  ],
  meaningPronunciations: [
    { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
  ],
} as const;
const question = {
  id: ids.question,
  sessionId: ids.session,
  position: 1,
  vocabularyId: ids.vocabulary,
  meaningId: ids.meaning,
  pronunciationId: ids.pronunciation,
  mode: 'THAI_TO_MEANING',
  prompt: { type: 'TEXT', text: 'เรียน' },
  options: [
    { id: ids.option, label: '배우다' },
    { id: ids.secondOption, label: '가르치다' },
    { id: ids.thirdOption, label: '읽다' },
    { id: ids.fourthOption, label: '쓰다' },
  ],
  correctOptionId: ids.option,
  card,
} as const;
const answer = {
  id: ids.answer,
  sessionId: ids.session,
  questionId: ids.question,
  userId: ids.user,
  clientAnswerId: ids.client,
  selectedOptionId: ids.option,
  selectedLabelSnapshot: '배우다',
  isCorrect: true,
  answeredAt: new Date('2026-07-26T00:01:00.000Z'),
} as const;

const record = (completed = false) => ({
  id: ids.session,
  userId: ids.user,
  sourceType: 'SEARCH_SELECTION',
  sourceWordbookId: null,
  sourceLabel: '공용 검색',
  modes: ['THAI_TO_MEANING'],
  requestedQuestionCount: 10,
  order: 'SOURCE',
  questionCount: 1,
  startedAt: now,
  questions: [question],
  status: completed ? 'COMPLETED' : 'ACTIVE',
  completedAt: completed ? answer.answeredAt : null,
  answers: completed ? [answer] : [],
});

const dependencies = () => ({
  practice: {
    create: vi.fn().mockResolvedValue(record()),
    get: vi.fn().mockResolvedValue(record()),
    answer: vi.fn().mockResolvedValue({
      answer,
      correctOptionId: ids.option,
      card,
      sessionCompleted: true,
    }),
  },
});

describe('LearnerVocabularyPracticeService 공개 응답', () => {
  it('미답 정답을 제외한 학습 문항을 반환한다', async () => {
    const fake = dependencies();
    const service = new LearnerVocabularyPracticeService(fake);

    const result = await service.get(ids.user, ids.session);

    expect(JSON.stringify(result)).not.toMatch(/storageKey|correctOptionId/u);
  });

  it('원시 답안에서 answeredQuestionIds와 완료 aggregate를 만든다', async () => {
    const fake = dependencies();
    fake.practice.get.mockResolvedValueOnce(record(true));
    const service = new LearnerVocabularyPracticeService(fake);

    const result = await service.get(ids.user, ids.session);

    expect(result.status).toBe('COMPLETED');
    expect(result.answeredQuestionIds).toEqual([ids.question]);
    if (result.status === 'COMPLETED') {
      expect(result.result.total).toEqual({ correct: 1, incorrect: 0 });
    }
  });

  it('답 제출 직후 정답과 전체 카드만 공개한다', async () => {
    const fake = dependencies();
    const service = new LearnerVocabularyPracticeService(fake);

    const result = await service.answer(ids.user, ids.session, ids.question, {
      clientAnswerId: ids.client,
      selectedOptionId: ids.option,
    });

    expect(result).toMatchObject({
      isCorrect: true,
      correctOptionId: ids.option,
      sessionCompleted: true,
    });
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });
});

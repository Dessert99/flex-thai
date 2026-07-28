/** 결정적 문제 생성 fake가 canonical fixture와 고정 사용량을 안전하게 반환하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  validateGeneratedQuestionSchema,
  validateQuestionDecisionRules,
} from '@flex-thia/domain';
import type {
  GeneratedQuestionCandidate,
  QuestionGenerationInput,
  QuestionProductionContext,
} from '@flex-thia/domain';
import { FakeQuestionGenerationProvider } from './fake-question-generation.provider.js';

const sentence = {
  originalText: 'ข้อใดถูกต้อง',
  translationKo: '어느 것이 맞습니까?',
  pronunciationKo: '커 다이 툭 떵',
  toneMarks: '',
  tokens: [
    {
      surface: 'ข้อใดถูกต้อง',
      startOffset: 0,
      endOffset: 12,
      vocabulary: { clientRef: 'vocabulary-question' },
      meaning: { clientRef: 'meaning-question' },
      pronunciation: { clientRef: 'pronunciation-question' },
      contextMeaningKo: '어느 것이 맞는가',
      role: 'TARGET' as const,
    },
  ],
  expressions: [],
};

const candidate: GeneratedQuestionCandidate = {
  questionTypeVersionId: 'type-version-id',
  topicId: 'topic-id',
  tagIds: ['tag-id'],
  difficulty: 1,
  payload: {
    questionTypeSlug: 'reading-choice',
    questionTypeVersion: 1,
    difficulty: 1,
    topicSlug: 'daily-life',
    tagSlugs: ['basic'],
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [{ speaker: null, sentence }],
      },
    ],
    options: [
      {
        clientRef: 'option-1',
        position: 0,
        sentence,
        span: null,
      },
    ],
    correctOptionRef: 'option-1',
  },
};

const context: QuestionProductionContext = {
  commonPrinciples: [],
  difficulty: 1,
  similarityThreshold: 0.7,
  speakerRoles: [],
  typeVersion: {
    id: 'type-version-id',
    slug: 'reading-choice',
    version: 1,
    template: 'STANDARD_CHOICE',
    structureRules: { optionCount: 1, template: 'STANDARD_CHOICE' },
    generationRules: {
      allowedTopics: [
        { id: 'topic-id', slug: 'daily-life', displayName: '일상' },
      ],
      allowedTags: [{ id: 'tag-id', slug: 'basic', displayName: '기초' }],
    },
  },
  difficultyCriteria: [],
  approvedExamples: [],
  targetVocabulary: [
    {
      thai: 'ข้อใดถูกต้อง',
      meaningKo: '어느 것이 맞는가',
      partOfSpeech: '표현',
      difficulty: 1,
    },
  ],
  requiredVocabulary: [],
  excludedVocabulary: [],
  newAuxiliaryVocabularyLimit: 0,
  similarQuestions: [],
  additionalInstructionKo: null,
};

const input = (signal: AbortSignal): QuestionGenerationInput => ({
  prompt: {
    promptVersion: 'question-generation-v1',
    sections: [],
    outputSchema: {},
  },
  preset: {
    id: 'preset-id',
    name: '문제 생성',
    purpose: 'QUESTION_GENERATION',
    version: 1,
    parameters: {},
  },
  signal,
});

describe('결정적 문제 생성 fake', () => {
  it('prompt version fixture의 canonical 후보와 고정 사용량을 복제해 반환한다', async () => {
    const provider = new FakeQuestionGenerationProvider({
      'question-generation-v1': [candidate],
    });

    const result = await provider.generate(input(new AbortController().signal));
    result.candidates[0]!.payload.tagSlugs.push('mutated');
    const replay = await provider.generate(input(new AbortController().signal));

    expect(validateGeneratedQuestionSchema(replay.candidates[0])).toEqual({
      status: 'PASSED',
      code: null,
    });
    expect(
      validateQuestionDecisionRules(replay.candidates[0]!, context),
    ).toEqual({ status: 'PASSED', code: null });
    expect(replay).toMatchObject({
      usage: { inputTokens: 120, outputTokens: 80 },
      estimatedCostUsd: '0',
      providerRequestId: 'fake-question-generation-v1',
    });
    expect(replay.candidates[0]?.payload.tagSlugs).toEqual(['basic']);
  });

  it('이미 취소된 호출은 fixture를 반환하지 않는다', async () => {
    const controller = new AbortController();
    controller.abort(new Error('lease lost'));
    const provider = new FakeQuestionGenerationProvider({
      'question-generation-v1': [candidate],
    });

    await expect(provider.generate(input(controller.signal))).rejects.toThrow(
      'lease lost',
    );
  });
});

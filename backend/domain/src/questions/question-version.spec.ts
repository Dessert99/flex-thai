/** 문제 버전의 구조와 최신 게시 의존성을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  validateQuestionVersion,
  type QuestionVersionValidationCandidate,
} from './question-version.js';

const candidate = (): QuestionVersionValidationCandidate => ({
  id: 'version-id',
  questionId: 'question-id',
  difficulty: 3,
  typeVersion: {
    id: 'type-version-id',
    template: 'STANDARD_CHOICE',
    optionCount: 2,
  },
  blocks: [
    {
      id: 'question-block',
      kind: 'QUESTION',
      position: 0,
      sentences: [],
    },
  ],
  options: [
    {
      id: 'option-1',
      position: 0,
      isCorrect: true,
      span: null,
      sentence: {
        id: 'sentence-1',
        input: {
          originalText: 'กข',
          translationKo: '정답',
          pronunciationKo: '꼬 커',
          toneMarks: '- -',
          tokens: [],
          expressions: [],
        },
        referencedVocabularies: [],
      },
    },
    {
      id: 'option-2',
      position: 1,
      isCorrect: false,
      span: null,
      sentence: {
        id: 'sentence-2',
        input: {
          originalText: 'คง',
          translationKo: '오답',
          pronunciationKo: '커 응어',
          toneMarks: '- -',
          tokens: [],
          expressions: [],
        },
        referencedVocabularies: [],
      },
    },
  ],
});

describe('QuestionVersion 문제 버전 게시 검증', () => {
  it('INLINE_SPAN_CHOICE는 QUESTION 문장 안의 네 범위를 허용한다', () => {
    const input = candidate();
    const sentence = requireOptionSentence(input);
    sentence.input.originalText = 'กขคง';
    sentence.input.tokens = Array.from({ length: 4 }, (_, position) => ({
      position,
      surface: Array.from(sentence.input.originalText)[position]!,
      startOffset: position,
      endOffset: position + 1,
      vocabularyId: `vocabulary-${position}`,
      meaningId: `meaning-${position}`,
      pronunciationId: `pronunciation-${position}`,
      contextMeaningKo: `뜻-${position}`,
      role: 'TARGET' as const,
    }));
    input.typeVersion = {
      ...input.typeVersion,
      template: 'INLINE_SPAN_CHOICE',
      optionCount: 4,
    };
    input.blocks[0]!.sentences = [{ speaker: null, sentence }];
    input.options = Array.from({ length: 4 }, (_, position) => ({
      id: `option-${position}`,
      position,
      isCorrect: position === 1,
      sentence: null,
      span: {
        sentenceVersionId: sentence.id,
        startTokenIndex: position,
        endTokenIndex: position + 1,
      },
    }));

    expect(validateQuestionVersion(input)).toEqual({
      status: 'PASSED',
      issues: [],
    });
  });

  it('inline 범위가 QUESTION 문장 밖이거나 token 범위를 벗어나면 거부한다', () => {
    const input = candidate();
    const sentence = requireOptionSentence(input);
    input.typeVersion = {
      ...input.typeVersion,
      template: 'INLINE_SPAN_CHOICE',
    };
    input.blocks[0]!.sentences = [{ speaker: null, sentence }];
    input.options = input.options.map((option) => ({
      id: option.id,
      position: option.position,
      isCorrect: option.isCorrect,
      sentence: null,
      span: {
        sentenceVersionId: 'other-sentence',
        startTokenIndex: 0,
        endTokenIndex: 99,
      },
    }));

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options.0.span',
      code: 'INLINE_SPAN_INVALID',
    });
  });

  it('STANDARD_CHOICE는 QUESTION 하나와 유형 버전의 선택지 수를 요구한다', () => {
    expect(validateQuestionVersion(candidate())).toEqual({
      status: 'PASSED',
      issues: [],
    });
  });

  it('PASSAGE_CHOICE는 PASSAGE와 QUESTION을 각각 하나 요구한다', () => {
    const input = candidate();
    input.typeVersion = { ...input.typeVersion, template: 'PASSAGE_CHOICE' };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'blocks',
      code: 'QUESTION_TEMPLATE_INVALID',
    });
  });

  it('DIALOGUE_CHOICE는 DIALOGUE와 QUESTION을 각각 하나 요구한다', () => {
    const input = candidate();
    input.typeVersion = { ...input.typeVersion, template: 'DIALOGUE_CHOICE' };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'blocks',
      code: 'QUESTION_TEMPLATE_INVALID',
    });
  });

  it('difficulty는 1부터 5까지의 정수여야 한다', () => {
    const input = candidate();
    input.difficulty = 2.5;

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'difficulty',
      code: 'DIFFICULTY_INVALID',
    });
  });

  it('block position은 배열 index와 같아야 한다', () => {
    const input = candidate();
    input.blocks[0] = { ...input.blocks[0]!, position: 1 };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'blocks.0.position',
      code: 'BLOCK_POSITION_INVALID',
    });
  });

  it('option position은 배열 index와 같아야 한다', () => {
    const input = candidate();
    input.options[1] = { ...input.options[1]!, position: 2 };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options.1.position',
      code: 'OPTION_POSITION_INVALID',
    });
  });

  it('선택지 수가 유형 버전과 다르면 게시 검증을 실패한다', () => {
    const input = candidate();
    input.typeVersion = { ...input.typeVersion, optionCount: 3 };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options',
      code: 'OPTION_COUNT_INVALID',
    });
  });

  it('정답 선택지가 두 개면 정확히 하나 규칙을 실패한다', () => {
    const input = candidate();
    input.options[1] = { ...input.options[1]!, isCorrect: true };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options',
      code: 'CORRECT_OPTION_COUNT_INVALID',
    });
  });

  it('대화 블록의 문장은 공백이 아닌 speaker를 요구한다', () => {
    const input = candidate();
    input.typeVersion = { ...input.typeVersion, template: 'DIALOGUE_CHOICE' };
    input.blocks = [
      {
        id: 'dialogue-block',
        kind: 'DIALOGUE',
        position: 0,
        sentences: [{ speaker: ' ', sentence: requireOptionSentence(input) }],
      },
      { ...input.blocks[0]!, position: 1 },
    ];

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'blocks.0.sentences.0.speaker',
      code: 'DIALOGUE_SPEAKER_REQUIRED',
    });
  });

  it('태국어 token offset이 원문과 다르면 문장 경로로 게시 검증을 실패한다', () => {
    const input = candidate();
    requireOptionSentence(input).input.tokens = [
      {
        position: 0,
        surface: 'ข',
        startOffset: 0,
        endOffset: 1,
        vocabularyId: 'vocabulary-id',
        meaningId: 'meaning-id',
        pronunciationId: 'pronunciation-id',
        contextMeaningKo: '뜻',
        role: 'TARGET',
      },
    ];

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options.0.sentence.tokens.0.surface',
      code: 'THAI_CONTENT_INVALID',
    });
  });

  it('숨긴 어휘를 참조하면 게시 검증을 실패한다', () => {
    const input = candidate();
    requireOptionSentence(input).referencedVocabularies = [
      { id: 'vocabulary-id', status: 'HIDDEN' },
    ];

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options.0.sentence.referencedVocabularies.0',
      code: 'VOCABULARY_NOT_PUBLISHED',
    });
  });
});

function requireOptionSentence(input: QuestionVersionValidationCandidate) {
  const sentence = input.options.at(0)?.sentence;
  if (sentence === null || sentence === undefined) {
    throw new Error('일반 선택지 문장이 없습니다.');
  }
  return sentence;
}

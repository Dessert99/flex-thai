/** AI 문제 후보의 검증 결과가 안정적인 검토 그룹으로 분류되는지 확인한다 */
import { describe, expect, it } from 'vitest';
import {
  assertDistinctValidationModels,
  buildQuestionGenerationPrompt,
  classifyQuestionCandidate,
  validateGeneratedQuestionSchema,
  validateQuestionDecisionRules,
  type GeneratedQuestionCandidate,
  type QuestionProductionContext,
  type QuestionProductionValidationRecord,
} from './ai-question-production.js';

const makeValidationFixture = (
  failedCode:
    | 'QUESTION_SCHEMA_INVALID'
    | 'QUESTION_RULE_INVALID'
    | 'QUESTION_SIMILARITY_REVIEW'
    | 'QUESTION_CROSS_VALIDATION_FAILED'
    | null,
): QuestionProductionValidationRecord[] => {
  const records: QuestionProductionValidationRecord[] = [
    {
      candidateOrdinal: 0,
      stage: 'SCHEMA',
      status: failedCode === 'QUESTION_SCHEMA_INVALID' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_SCHEMA_INVALID' ? 'INVALID' : null,
      details: {},
    },
    {
      candidateOrdinal: 0,
      stage: 'DECISION_RULE',
      status: failedCode === 'QUESTION_RULE_INVALID' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_RULE_INVALID' ? 'INVALID' : null,
      details: {},
    },
    {
      candidateOrdinal: 0,
      stage: 'SIMILARITY',
      status: failedCode === 'QUESTION_SIMILARITY_REVIEW' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_SIMILARITY_REVIEW' ? 'TOO_SIMILAR' : null,
      details: {},
    },
    {
      candidateOrdinal: 0,
      stage: 'AI_CROSS_VALIDATION',
      status:
        failedCode === 'QUESTION_CROSS_VALIDATION_FAILED' ? 'FAILED' : 'PASSED',
      code:
        failedCode === 'QUESTION_CROSS_VALIDATION_FAILED'
          ? 'ANSWER_MISMATCH'
          : null,
      details: {},
    },
  ];

  return records;
};

const candidate: GeneratedQuestionCandidate = {
  questionTypeVersionId: 'type-version-id',
  topicId: 'topic-id',
  tagIds: ['tag-id'],
  difficulty: 3,
  payload: {
    questionTypeSlug: 'reading-choice',
    questionTypeVersion: 1,
    difficulty: 3,
    topicSlug: 'daily-life',
    tagSlugs: ['basic'],
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [],
      },
    ],
    options: [
      {
        clientRef: 'option-a',
        position: 0,
        sentence: {
          originalText: 'ใช่',
          translationKo: '예',
          pronunciationKo: '차이',
          toneMarks: '',
          tokens: [],
          expressions: [],
        },
        span: null,
      },
    ],
    correctOptionRef: 'option-a',
  },
};

const tokenizedSentence = {
  originalText: 'ไปไหน',
  translationKo: '어디에 가나요?',
  pronunciationKo: '빠이 나이',
  toneMarks: '',
  tokens: [
    {
      surface: 'ไป',
      startOffset: 0,
      endOffset: 2,
      vocabulary: { clientRef: 'vocabulary-go' },
      meaning: { clientRef: 'meaning-go' },
      pronunciation: { clientRef: 'pronunciation-go' },
      contextMeaningKo: '가다',
      role: 'TARGET' as const,
    },
    {
      surface: 'ไหน',
      startOffset: 2,
      endOffset: 5,
      vocabulary: { clientRef: 'vocabulary-where' },
      meaning: { clientRef: 'meaning-where' },
      pronunciation: { clientRef: 'pronunciation-where' },
      contextMeaningKo: '어디',
      role: 'REQUIRED' as const,
    },
  ],
  expressions: [
    {
      startTokenIndex: 0,
      endTokenIndex: 2,
      vocabulary: { clientRef: 'vocabulary-expression' },
      meaning: { clientRef: 'meaning-expression' },
      pronunciation: { clientRef: 'pronunciation-expression' },
      contextMeaningKo: '어디에 가다',
      representative: true,
    },
  ],
};

const inlineCandidate: GeneratedQuestionCandidate = {
  ...candidate,
  payload: {
    ...candidate.payload,
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [{ speaker: null, sentence: tokenizedSentence }],
      },
    ],
    options: [
      {
        clientRef: 'option-a',
        position: 0,
        sentence: null,
        span: {
          blockPosition: 0,
          sentencePosition: 0,
          startTokenIndex: 0,
          endTokenIndex: 1,
        },
      },
    ],
  },
};

const productionContext: QuestionProductionContext = {
  commonPrinciples: [
    '정답은 하나만 둔다',
    '태국어 문장을 그대로 복제하지 않는다',
  ],
  typeVersion: {
    id: 'type-version-private-id',
    slug: 'reading-choice',
    version: 2,
    template: 'STANDARD_CHOICE',
    structureRules: { optionCount: 4, blockOrder: ['QUESTION'] },
    generationRules: { maxSupportingVocabulary: 3 },
  },
  difficultyCriteria: [
    { difficulty: 1, criteria: '기초 어휘만 사용한다' },
    { difficulty: 2, criteria: '기초 표현을 포함한다' },
    { difficulty: 3, criteria: '일상 주제의 짧은 문장을 사용한다' },
    { difficulty: 4, criteria: '연결 표현을 사용한다' },
    { difficulty: 5, criteria: '복합 표현을 포함한다' },
  ],
  approvedExamples: [
    {
      title: '기본 선택형 예시',
      payload: {
        questionTypeSlug: 'reading-choice',
        sourceText: '입력 원문 전체는 절대 전달하지 않는다',
        storageKey: 'private/example.json',
      },
    },
  ],
  targetVocabulary: [
    {
      thai: 'ไป',
      meaningKo: '가다',
      partOfSpeech: '동사',
      difficulty: 1,
    },
  ],
  requiredVocabulary: [
    {
      thai: 'ไหน',
      meaningKo: '어디',
      partOfSpeech: '의문사',
      difficulty: 1,
    },
  ],
  excludedVocabulary: [
    {
      thai: 'อย่างไรก็ตาม',
      meaningKo: '그러나',
      partOfSpeech: '접속사',
      difficulty: 5,
    },
  ],
  similarQuestions: [
    {
      difficulty: 3,
      summary: '일상 이동을 묻는 선택형 문제',
    },
  ],
  additionalInstructionKo: '학습자에게 자연스러운 한국어 해설을 제공하세요.',
};

describe('AI 문제 후보 검증 규칙', () => {
  it.each([
    ['schema 실패', 'FAILED', 'QUESTION_SCHEMA_INVALID'],
    ['결정 규칙 실패', 'FAILED', 'QUESTION_RULE_INVALID'],
    ['유사도 경고', 'NEEDS_ATTENTION', 'QUESTION_SIMILARITY_REVIEW'],
    ['교차 검증 불일치', 'NEEDS_ATTENTION', 'QUESTION_CROSS_VALIDATION_FAILED'],
    ['모든 검증 통과', 'NORMAL', null],
  ] as const)('%s 후보 그룹을 계산한다', (_label, group, code) => {
    expect(classifyQuestionCandidate(makeValidationFixture(code))).toEqual({
      group,
      code,
    });
  });

  it('필수 출력 field가 빠진 후보를 schema 실패로 반환한다', () => {
    expect(validateGeneratedQuestionSchema({})).toEqual({
      status: 'FAILED',
      code: 'QUESTION_SCHEMA_INVALID',
    });
  });

  it.each([
    [
      'token',
      {
        ...tokenizedSentence,
        tokens: [{ ...tokenizedSentence.tokens[0], role: undefined }],
      },
    ],
    [
      'expression',
      {
        ...tokenizedSentence,
        expressions: [
          {
            ...tokenizedSentence.expressions[0],
            pronunciation: undefined,
          },
        ],
      },
    ],
  ])(
    '%s의 canonical 중첩 shape가 잘못되면 schema 실패로 반환한다',
    (_label, sentence) => {
      expect(
        validateGeneratedQuestionSchema({
          ...candidate,
          payload: {
            ...candidate.payload,
            options: [
              {
                ...candidate.payload.options[0],
                sentence,
              },
            ],
          },
        }),
      ).toEqual({
        status: 'FAILED',
        code: 'QUESTION_SCHEMA_INVALID',
      });
    },
  );

  it('존재하지 않는 정답 선택지는 결정 규칙 실패로 반환한다', () => {
    expect(
      validateQuestionDecisionRules({
        ...candidate,
        payload: { ...candidate.payload, correctOptionRef: 'missing-option' },
      }),
    ).toEqual({
      status: 'FAILED',
      code: 'QUESTION_RULE_INVALID',
    });
  });

  it.each([
    [
      '존재하지 않는 block 위치',
      {
        blockPosition: 1,
        sentencePosition: 0,
        startTokenIndex: 0,
        endTokenIndex: 1,
      },
    ],
    [
      '존재하지 않는 sentence 위치',
      {
        blockPosition: 0,
        sentencePosition: 1,
        startTokenIndex: 0,
        endTokenIndex: 1,
      },
    ],
    [
      '역순 token 범위',
      {
        blockPosition: 0,
        sentencePosition: 0,
        startTokenIndex: 1,
        endTokenIndex: 0,
      },
    ],
    [
      '범위를 벗어난 token 끝 위치',
      {
        blockPosition: 0,
        sentencePosition: 0,
        startTokenIndex: 0,
        endTokenIndex: 3,
      },
    ],
  ] as const)(
    '%s를 참조하는 inline span은 결정 규칙 실패로 반환한다',
    (_label, span) => {
      const option = inlineCandidate.payload.options[0];
      if (!option || option.sentence !== null) {
        throw new Error('inline fixture가 아닙니다');
      }

      expect(
        validateQuestionDecisionRules({
          ...inlineCandidate,
          payload: {
            ...inlineCandidate.payload,
            options: [{ ...option, span }],
          },
        }),
      ).toEqual({
        status: 'FAILED',
        code: 'QUESTION_RULE_INVALID',
      });
    },
  );

  it('유효한 inline span은 결정 규칙을 통과한다', () => {
    expect(validateQuestionDecisionRules(inlineCandidate)).toEqual({
      status: 'PASSED',
      code: null,
    });
  });

  it('schema와 유사도가 함께 실패하면 schema 실패를 우선한다', () => {
    const validations = makeValidationFixture('QUESTION_SCHEMA_INVALID');
    const similarity = validations.find(
      (validation) => validation.stage === 'SIMILARITY',
    );
    if (similarity) similarity.status = 'FAILED';

    expect(classifyQuestionCandidate(validations)).toEqual({
      group: 'FAILED',
      code: 'QUESTION_SCHEMA_INVALID',
    });
  });

  it('결정 규칙과 교차 검증이 함께 실패하면 결정 규칙 실패를 우선한다', () => {
    const validations = makeValidationFixture('QUESTION_RULE_INVALID');
    const crossValidation = validations.find(
      (validation) => validation.stage === 'AI_CROSS_VALIDATION',
    );
    if (crossValidation) crossValidation.status = 'FAILED';

    expect(classifyQuestionCandidate(validations)).toEqual({
      group: 'FAILED',
      code: 'QUESTION_RULE_INVALID',
    });
  });

  it('생성 모델과 교차 검증 모델이 같으면 provider 호출 전에 거절한다', () => {
    expect(() =>
      assertDistinctValidationModels('generation-model', 'generation-model'),
    ).toThrowError('QUESTION_VALIDATION_MODEL_DUPLICATE');
  });
});

describe('AI 문제 생성 prompt 조립', () => {
  it('활성 유형 자료를 안정적인 section 순서의 prompt로 조립한다', () => {
    const prompt = buildQuestionGenerationPrompt(productionContext);

    expect(prompt).toMatchObject({ promptVersion: 'question-generation-v1' });
    expect(prompt.sections.map((section) => section.name)).toEqual([
      'common-principles',
      'question-type',
      'difficulty-criteria',
      'approved-examples',
      'vocabulary-policy',
      'similar-question-summaries',
      'additional-instruction-ko',
    ]);
    expect(prompt.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'question-type',
          content: expect.stringContaining('"slug":"reading-choice"'),
        }),
        expect.objectContaining({
          name: 'difficulty-criteria',
          content: expect.stringContaining('"difficulty":3'),
        }),
        expect.objectContaining({
          name: 'approved-examples',
          content: expect.stringContaining('기본 선택형 예시'),
        }),
        expect.objectContaining({
          name: 'vocabulary-policy',
          content: expect.stringContaining('"targetVocabulary"'),
        }),
        expect.objectContaining({
          name: 'similar-question-summaries',
          content: expect.stringContaining('일상 이동을 묻는 선택형 문제'),
        }),
        expect.objectContaining({
          name: 'additional-instruction-ko',
          content: '학습자에게 자연스러운 한국어 해설을 제공하세요.',
        }),
      ]),
    );
    expect(prompt.outputSchema).toMatchObject({
      type: 'object',
      required: ['candidates'],
    });
  });

  it('JSON section은 key 순서와 무관하게 같은 문자열로 직렬화한다', () => {
    const reversedRules: QuestionProductionContext = {
      ...productionContext,
      typeVersion: {
        ...productionContext.typeVersion,
        structureRules: { blockOrder: ['QUESTION'], optionCount: 4 },
      },
    };

    expect(buildQuestionGenerationPrompt(reversedRules)).toEqual(
      buildQuestionGenerationPrompt(productionContext),
    );
  });

  it('private storage key와 입력 원문 전체를 prompt에 포함하지 않는다', () => {
    const prompt = buildQuestionGenerationPrompt(productionContext);
    const serializedPrompt = JSON.stringify(prompt);

    expect(serializedPrompt).not.toContain('private/example.json');
    expect(serializedPrompt).not.toContain(
      '입력 원문 전체는 절대 전달하지 않는다',
    );
    expect(serializedPrompt).not.toContain('type-version-private-id');
  });

  it.each([
    {
      label: '선택 난이도 기준이 없을 때',
      context: {
        ...productionContext,
        difficultyCriteria: productionContext.difficultyCriteria.filter(
          (criterion) => criterion.difficulty !== 3,
        ),
      },
    },
    {
      label: '승인 예시가 없을 때',
      context: { ...productionContext, approvedExamples: [] },
    },
  ])('$label provider 호출 전에 taxonomy 오류를 반환한다', ({ context }) => {
    let providerCalls = 0;
    const callProvider = (): void => {
      providerCalls += 1;
    };

    expect(() => {
      const prompt = buildQuestionGenerationPrompt(context);
      callProvider();
      return prompt;
    }).toThrowError('QUESTION_TAXONOMY_INCOMPLETE');
    expect(providerCalls).toBe(0);
  });
});

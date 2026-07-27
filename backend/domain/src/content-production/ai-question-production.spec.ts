/** AI 문제 후보의 검증 결과가 안정적인 검토 그룹으로 분류되는지 확인한다 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  assertDistinctValidationModels,
  buildQuestionGenerationPrompt,
  classifyQuestionCandidate,
  normalizeQuestionProductionValidationRecord,
  projectQuestionPromptApprovedExample,
  QuestionCandidateReviewService,
  validateGeneratedQuestionSchema,
  validateQuestionDecisionRules,
  type GeneratedQuestionDraftRepository,
  type GeneratedQuestionCandidate,
  type QuestionProductionCandidateRecord,
  type QuestionProductionCandidateRepository,
  type QuestionProductionContext,
  type QuestionProductionProviderRunRepository,
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
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'SCHEMA',
      status: failedCode === 'QUESTION_SCHEMA_INVALID' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_SCHEMA_INVALID' ? 'INVALID' : null,
      details: {},
    }),
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'DECISION_RULE',
      status: failedCode === 'QUESTION_RULE_INVALID' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_RULE_INVALID' ? 'INVALID' : null,
      details: {},
    }),
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'SIMILARITY',
      status: failedCode === 'QUESTION_SIMILARITY_REVIEW' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_SIMILARITY_REVIEW' ? 'TOO_SIMILAR' : null,
      details: {},
    }),
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'AI_CROSS_VALIDATION',
      status:
        failedCode === 'QUESTION_CROSS_VALIDATION_FAILED' ? 'FAILED' : 'PASSED',
      code:
        failedCode === 'QUESTION_CROSS_VALIDATION_FAILED'
          ? 'ANSWER_MISMATCH'
          : null,
      details: {},
    }),
  ];

  return records;
};

const singleTokenSentence = {
  originalText: 'ใช่',
  translationKo: '예',
  pronunciationKo: '차이',
  toneMarks: '',
  tokens: [
    {
      surface: 'ใช่',
      startOffset: 0,
      endOffset: 3,
      vocabulary: { clientRef: 'vocabulary-yes' },
      meaning: { clientRef: 'meaning-yes' },
      pronunciation: { clientRef: 'pronunciation-yes' },
      contextMeaningKo: '예',
      role: 'TARGET' as const,
    },
  ],
  expressions: [],
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
        sentence: singleTokenSentence,
        span: null,
      },
    ],
    correctOptionRef: 'option-a',
  },
};

describe('AI 문제 후보 저장 port', () => {
  it('item lease 아래 terminal 결과와 후보 artifact를 함께 저장한다', () => {
    expectTypeOf<QuestionProductionCandidateRepository>().toMatchTypeOf<{
      persist(input: {
        jobId: string;
        itemId: string;
        attempt: number;
        leaseToken: string;
        outcome: {
          status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
          retryable: boolean;
          errorCode: string | null;
          result?: Record<string, unknown>;
        };
        artifacts: { kind: 'QUESTION_CANDIDATES' };
      }): Promise<boolean>;
    }>();
  });

  it('후보 검토와 승인 연결 상태를 attempt snapshot에 보존한다', () => {
    expectTypeOf<QuestionProductionCandidateRecord>().toMatchTypeOf<{
      reviewStatus: 'PENDING' | 'APPROVED' | 'DISCARDED';
      regeneratedFromCandidateId: string | null;
      approvedQuestionId: string | null;
      approvedQuestionVersionId: string | null;
    }>();
  });

  it('문제 생성 결과에 맞는 provider 실행 replay 계약을 제공한다', () => {
    expectTypeOf<
      QuestionProductionProviderRunRepository['claim']
    >().toBeFunction();
    expectTypeOf<
      QuestionProductionProviderRunRepository['succeed']
    >().toBeFunction();
    expectTypeOf<
      QuestionProductionProviderRunRepository['fail']
    >().toBeFunction();
  });
});

describe('AI 문제 후보 검토 서비스', () => {
  const command = {
    candidateId: 'candidate-id',
    expectedRevision: 0,
    actorUserId: 'actor-user-id',
    actorSub: 'actor-sub',
    requestId: 'request-id',
    occurredAt: new Date('2026-07-27T02:00:00.000Z'),
  };

  it('첫 승인과 같은 request replay를 같은 DRAFT 결과로 반환한다', async () => {
    const results = [
      {
        kind: 'APPROVED' as const,
        questionId: 'question-id',
        questionVersionId: 'version-id',
      },
      {
        kind: 'ALREADY_APPROVED' as const,
        questionId: 'question-id',
        questionVersionId: 'version-id',
      },
    ];
    const repository: GeneratedQuestionDraftRepository = {
      approve: () => Promise.resolve(results.shift()!),
      discard: () => Promise.resolve(true),
      requestRegeneration: () =>
        Promise.resolve({ jobId: 'job-id', attempt: 1 }),
    };
    const service = new QuestionCandidateReviewService(repository);

    await expect(service.approve(command)).resolves.toEqual({
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
    await expect(service.approve(command)).resolves.toEqual({
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
  });

  it('stale revision이나 다른 request의 중복 승인을 stable conflict로 거절한다', async () => {
    const repository: GeneratedQuestionDraftRepository = {
      approve: () => Promise.resolve({ kind: 'CONFLICT' }),
      discard: () => Promise.resolve(false),
      requestRegeneration: () =>
        Promise.resolve({ jobId: 'job-id', attempt: 1 }),
    };
    const service = new QuestionCandidateReviewService(repository);

    await expect(service.approve(command)).rejects.toThrow(
      'QUESTION_CANDIDATE_REVIEW_CONFLICT',
    );
    await expect(service.discard(command)).rejects.toThrow(
      'QUESTION_CANDIDATE_REVIEW_CONFLICT',
    );
  });

  it('재생성 결과의 job과 증가한 attempt를 그대로 반환한다', async () => {
    const repository: GeneratedQuestionDraftRepository = {
      approve: () => Promise.resolve({ kind: 'CONFLICT' }),
      discard: () => Promise.resolve(true),
      requestRegeneration: () =>
        Promise.resolve({ jobId: 'job-id', attempt: 3 }),
    };
    const service = new QuestionCandidateReviewService(repository);

    await expect(service.regenerate(command)).resolves.toEqual({
      jobId: 'job-id',
      attempt: 3,
    });
  });
});

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

const approvedExamplePayload = Object.assign({}, candidate.payload, {
  privatePayloadAlias: '절대 노출하면 안 되는 별칭',
  rawProviderPayload: '절대 노출하면 안 되는 원본 응답',
  sourceText: '입력 원문 전체는 절대 전달하지 않는다',
  storageKey: 'private/example.json',
}) as GeneratedQuestionCandidate['payload'];

const productionContext: QuestionProductionContext = {
  commonPrinciples: [
    '정답은 하나만 둔다',
    '태국어 문장을 그대로 복제하지 않는다',
  ],
  typeVersion: {
    id: 'type-version-id',
    slug: 'reading-choice',
    version: 2,
    template: 'STANDARD_CHOICE',
    structureRules: { optionCount: 4, blockOrder: ['QUESTION'] },
    generationRules: {
      allowedTopics: [
        { id: 'topic-id', slug: 'daily-life', displayName: '일상' },
      ],
      allowedTags: [{ id: 'tag-id', slug: 'basic', displayName: '기초' }],
      maxSupportingVocabulary: 3,
    },
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
      payload: approvedExamplePayload,
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
  newAuxiliaryVocabularyLimit: 3,
  additionalInstructionKo: '학습자에게 자연스러운 한국어 해설을 제공하세요.',
};

const standardDecisionContext: QuestionProductionContext = {
  ...productionContext,
  typeVersion: {
    ...productionContext.typeVersion,
    version: 1,
    structureRules: { optionCount: 1, template: 'STANDARD_CHOICE' },
  },
  targetVocabulary: [
    {
      thai: 'ใช่',
      meaningKo: '예',
      partOfSpeech: '부사',
      difficulty: 1,
    },
  ],
  requiredVocabulary: [],
};

const inlineDecisionContext: QuestionProductionContext = {
  ...productionContext,
  typeVersion: {
    ...productionContext.typeVersion,
    version: 1,
    template: 'INLINE_SPAN_CHOICE',
    structureRules: { optionCount: 1, template: 'INLINE_SPAN_CHOICE' },
  },
};

const supportingVocabularyCandidate: GeneratedQuestionCandidate = {
  ...candidate,
  payload: {
    ...candidate.payload,
    options: [
      {
        clientRef: 'option-a',
        position: 0,
        sentence: {
          ...singleTokenSentence,
          originalText: 'ใหม่',
          tokens: [
            {
              ...singleTokenSentence.tokens[0]!,
              surface: 'ใหม่',
              endOffset: 4,
              role: 'SUPPORTING',
            },
          ],
        },
        span: null,
      },
    ],
  },
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

  it('FAILED 검증 record의 null code를 단계별 stable code로 정규화한다', () => {
    expect(
      normalizeQuestionProductionValidationRecord({
        candidateOrdinal: 0,
        stage: 'AI_CROSS_VALIDATION',
        status: 'FAILED',
        code: null,
        details: {},
      }),
    ).toEqual({
      candidateOrdinal: 0,
      stage: 'AI_CROSS_VALIDATION',
      status: 'FAILED',
      code: 'QUESTION_CROSS_VALIDATION_FAILED',
      details: {},
    });
  });

  it('실행하지 않은 검증 record를 SKIPPED stable code로 정규화한다', () => {
    expect(
      normalizeQuestionProductionValidationRecord({
        candidateOrdinal: 0,
        stage: 'SIMILARITY',
        status: 'SKIPPED',
        code: null,
        details: {},
      }),
    ).toEqual({
      candidateOrdinal: 0,
      stage: 'SIMILARITY',
      status: 'SKIPPED',
      code: 'QUESTION_VALIDATION_SKIPPED',
      details: {},
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

  it.each([
    [
      '음수 token 시작 offset',
      {
        ...singleTokenSentence,
        tokens: [{ ...singleTokenSentence.tokens[0], startOffset: -1 }],
      },
    ],
    [
      '원문 밖 token 끝 offset',
      {
        ...singleTokenSentence,
        tokens: [{ ...singleTokenSentence.tokens[0], endOffset: 4 }],
      },
    ],
    [
      '원문과 다른 token surface',
      {
        ...singleTokenSentence,
        tokens: [{ ...singleTokenSentence.tokens[0], surface: 'ไม่' }],
      },
    ],
    [
      '겹치는 token 범위',
      {
        ...tokenizedSentence,
        tokens: [
          tokenizedSentence.tokens[0],
          { ...tokenizedSentence.tokens[1], startOffset: 1 },
        ],
      },
    ],
    [
      '역순 expression 범위',
      {
        ...tokenizedSentence,
        expressions: [
          { ...tokenizedSentence.expressions[0], startTokenIndex: 2 },
        ],
      },
    ],
    [
      'token 범위 밖 expression',
      {
        ...tokenizedSentence,
        expressions: [
          { ...tokenizedSentence.expressions[0], endTokenIndex: 3 },
        ],
      },
    ],
    ['token이 없는 태국어 원문', { ...singleTokenSentence, tokens: [] }],
  ])('%s은 schema 실패로 반환한다', (_label, sentence) => {
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
  });

  it('존재하지 않는 정답 선택지는 결정 규칙 실패로 반환한다', () => {
    expect(
      validateQuestionDecisionRules(
        {
          ...candidate,
          payload: { ...candidate.payload, correctOptionRef: 'missing-option' },
        },
        standardDecisionContext,
      ),
    ).toEqual({
      status: 'FAILED',
      code: 'QUESTION_RULE_INVALID',
    });
  });

  it.each([
    [
      '유형 버전 ID',
      { ...candidate, questionTypeVersionId: 'other-version-id' },
    ],
    [
      '유형 slug',
      {
        ...candidate,
        payload: { ...candidate.payload, questionTypeSlug: 'other-type' },
      },
    ],
    [
      '유형 version',
      {
        ...candidate,
        payload: { ...candidate.payload, questionTypeVersion: 2 },
      },
    ],
    ['주제 ID', { ...candidate, topicId: 'other-topic-id' }],
    [
      '주제 slug',
      {
        ...candidate,
        payload: { ...candidate.payload, topicSlug: 'other-topic' },
      },
    ],
    ['태그 ID', { ...candidate, tagIds: ['other-tag-id'] }],
    [
      '태그 slug',
      {
        ...candidate,
        payload: { ...candidate.payload, tagSlugs: ['other-tag'] },
      },
    ],
  ])('%s가 생성 문맥과 다르면 결정 규칙 실패로 반환한다', (_label, input) => {
    expect(
      validateQuestionDecisionRules(input, standardDecisionContext),
    ).toEqual({
      status: 'FAILED',
      code: 'QUESTION_RULE_INVALID',
    });
  });

  it.each([
    [
      '유형별 optionCount',
      {
        context: {
          ...standardDecisionContext,
          typeVersion: {
            ...standardDecisionContext.typeVersion,
            structureRules: { optionCount: 2, template: 'STANDARD_CHOICE' },
          },
        },
        input: candidate,
      },
    ],
    [
      'PASSAGE_CHOICE passage block',
      {
        context: {
          ...standardDecisionContext,
          typeVersion: {
            ...standardDecisionContext.typeVersion,
            template: 'PASSAGE_CHOICE' as const,
            structureRules: { optionCount: 1, template: 'PASSAGE_CHOICE' },
          },
        },
        input: candidate,
      },
    ],
    [
      'DIALOGUE_CHOICE dialogue block',
      {
        context: {
          ...standardDecisionContext,
          typeVersion: {
            ...standardDecisionContext.typeVersion,
            template: 'DIALOGUE_CHOICE' as const,
            structureRules: { optionCount: 1, template: 'DIALOGUE_CHOICE' },
          },
        },
        input: candidate,
      },
    ],
    [
      'INLINE_SPAN_CHOICE span option',
      { context: inlineDecisionContext, input: candidate },
    ],
  ])(
    '%s이 맞지 않으면 결정 규칙 실패로 반환한다',
    (_label, { context, input }) => {
      expect(validateQuestionDecisionRules(input, context)).toEqual({
        status: 'FAILED',
        code: 'QUESTION_RULE_INVALID',
      });
    },
  );

  it.each([
    [
      '필수 어휘가 없으면',
      {
        ...standardDecisionContext,
        requiredVocabulary: [
          {
            thai: 'ต้อง',
            meaningKo: '필요하다',
            partOfSpeech: '동사',
            difficulty: 1,
          },
        ],
      },
      candidate,
    ],
    [
      '제외 어휘가 있으면',
      {
        ...standardDecisionContext,
        excludedVocabulary: [
          {
            thai: 'ใช่',
            meaningKo: '예',
            partOfSpeech: '부사',
            difficulty: 1,
          },
        ],
      },
      candidate,
    ],
    [
      '제외 표현이 있으면',
      {
        ...inlineDecisionContext,
        excludedVocabulary: [
          {
            thai: 'ไปไหน',
            meaningKo: '어디에 가다',
            partOfSpeech: '표현',
            difficulty: 1,
          },
        ],
      },
      inlineCandidate,
    ],
    [
      '신규 보조 어휘 한도를 넘으면',
      { ...standardDecisionContext, newAuxiliaryVocabularyLimit: 0 },
      supportingVocabularyCandidate,
    ],
  ] satisfies Array<
    [string, QuestionProductionContext, GeneratedQuestionCandidate]
  >)('%s 결정 규칙 실패로 반환한다', (_label, context, input) => {
    expect(validateQuestionDecisionRules(input, context)).toEqual({
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
        validateQuestionDecisionRules(
          {
            ...inlineCandidate,
            payload: {
              ...inlineCandidate.payload,
              options: [{ ...option, span }],
            },
          },
          inlineDecisionContext,
        ),
      ).toEqual({
        status: 'FAILED',
        code: 'QUESTION_RULE_INVALID',
      });
    },
  );

  it('유효한 inline span은 결정 규칙을 통과한다', () => {
    expect(
      validateQuestionDecisionRules(inlineCandidate, inlineDecisionContext),
    ).toEqual({
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
      'new-auxiliary-vocabulary-limit',
      'similar-question-summaries',
      'additional-instruction-ko',
    ]);
    const section = (name: string): unknown =>
      prompt.sections.find((item) => item.name === name)?.content;
    expect(section('question-type')).toEqual(
      expect.stringContaining('"slug":"reading-choice"'),
    );
    expect(section('difficulty-criteria')).toEqual(
      expect.stringContaining('"difficulty":3'),
    );
    expect(section('approved-examples')).toEqual(
      expect.stringContaining('기본 선택형 예시'),
    );
    expect(section('vocabulary-policy')).toEqual(
      expect.stringContaining('"targetVocabulary"'),
    );
    expect(section('new-auxiliary-vocabulary-limit')).toBe(3);
    expect(section('similar-question-summaries')).toEqual(
      expect.stringContaining('일상 이동을 묻는 선택형 문제'),
    );
    expect(section('additional-instruction-ko')).toBe(
      '학습자에게 자연스러운 한국어 해설을 제공하세요.',
    );
    expect(prompt.outputSchema).toMatchObject({
      type: 'object',
      required: ['candidates'],
    });
  });

  it('output schema가 canonical block과 두 option 변형의 중첩 구조를 고정한다', () => {
    const prompt = buildQuestionGenerationPrompt(productionContext);

    expect(prompt.outputSchema).toMatchObject({
      properties: {
        candidates: {
          items: {
            required: [
              'questionTypeVersionId',
              'topicId',
              'tagIds',
              'difficulty',
              'payload',
            ],
            properties: {
              payload: {
                properties: {
                  blocks: {
                    items: {
                      required: ['kind', 'displayMode', 'sentences'],
                      properties: {
                        sentences: {
                          items: {
                            required: ['speaker', 'sentence'],
                            properties: {
                              sentence: {
                                required: [
                                  'originalText',
                                  'translationKo',
                                  'pronunciationKo',
                                  'toneMarks',
                                  'tokens',
                                  'expressions',
                                ],
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  options: {
                    items: {
                      oneOf: [
                        expect.objectContaining({
                          required: [
                            'clientRef',
                            'position',
                            'sentence',
                            'span',
                          ],
                        }),
                        expect.objectContaining({
                          required: [
                            'clientRef',
                            'position',
                            'sentence',
                            'span',
                          ],
                        }),
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
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

  it('Unicode 정규화 표현이 다른 규칙 key도 삽입 순서와 무관하다', () => {
    const composedKey = 'é';
    const decomposedKey = 'e\u0301';
    const ordered: QuestionProductionContext = {
      ...productionContext,
      typeVersion: {
        ...productionContext.typeVersion,
        structureRules: Object.fromEntries([
          [composedKey, '조합형'],
          [decomposedKey, '분해형'],
        ]),
      },
    };
    const reversed: QuestionProductionContext = {
      ...productionContext,
      typeVersion: {
        ...productionContext.typeVersion,
        structureRules: Object.fromEntries([
          [decomposedKey, '분해형'],
          [composedKey, '조합형'],
        ]),
      },
    };

    expect(buildQuestionGenerationPrompt(reversed)).toEqual(
      buildQuestionGenerationPrompt(ordered),
    );
  });

  it('동일 주요 값의 예시와 어휘 순서를 바꿔도 prompt가 같다', () => {
    const secondExample = {
      title: productionContext.approvedExamples[0]?.title ?? '',
      payload: { ...candidate.payload, topicSlug: 'travel' },
    };
    const secondVocabulary = {
      thai: 'ไป',
      meaningKo: '가다',
      partOfSpeech: '보조동사',
      difficulty: 2,
    };
    const ordered: QuestionProductionContext = {
      ...productionContext,
      approvedExamples: [productionContext.approvedExamples[0]!, secondExample],
      targetVocabulary: [
        productionContext.targetVocabulary[0]!,
        secondVocabulary,
      ],
    };
    const swapped: QuestionProductionContext = {
      ...ordered,
      approvedExamples: [...ordered.approvedExamples].reverse(),
      targetVocabulary: [...ordered.targetVocabulary].reverse(),
    };

    expect(buildQuestionGenerationPrompt(swapped)).toEqual(
      buildQuestionGenerationPrompt(ordered),
    );
  });

  it('Unicode 정규화 표현이 다른 예시와 어휘도 입력 순서와 무관하다', () => {
    const composed = 'é';
    const decomposed = 'e\u0301';
    const ordered: QuestionProductionContext = {
      ...productionContext,
      approvedExamples: [
        { title: composed, payload: candidate.payload },
        { title: decomposed, payload: candidate.payload },
      ],
      targetVocabulary: [
        {
          thai: 'คำ',
          meaningKo: composed,
          partOfSpeech: '명사',
          difficulty: 1,
        },
        {
          thai: 'คำ',
          meaningKo: decomposed,
          partOfSpeech: '명사',
          difficulty: 1,
        },
      ],
    };
    const swapped: QuestionProductionContext = {
      ...ordered,
      approvedExamples: [...ordered.approvedExamples].reverse(),
      targetVocabulary: [...ordered.targetVocabulary].reverse(),
    };

    expect(buildQuestionGenerationPrompt(swapped)).toEqual(
      buildQuestionGenerationPrompt(ordered),
    );
  });

  it('Unicode 정규화 표현이 다른 유사 문제도 입력 순서와 무관하다', () => {
    const ordered: QuestionProductionContext = {
      ...productionContext,
      similarQuestions: [
        { difficulty: 3, summary: 'café' },
        { difficulty: 3, summary: 'cafe\u0301' },
      ],
    };
    const swapped: QuestionProductionContext = {
      ...ordered,
      similarQuestions: [...ordered.similarQuestions].reverse(),
    };

    expect(buildQuestionGenerationPrompt(swapped)).toEqual(
      buildQuestionGenerationPrompt(ordered),
    );
  });

  it('승인 예시는 canonical allow-list만 투영해 임의 private alias를 차단한다', () => {
    const prompt = buildQuestionGenerationPrompt(productionContext);
    const serializedPrompt = JSON.stringify(prompt);
    const approvedExamples = prompt.sections.find(
      (section) => section.name === 'approved-examples',
    )?.content;

    expect(approvedExamples).toEqual(
      expect.stringContaining('"originalText":"ใช่"'),
    );
    expect(approvedExamples).toEqual(
      expect.stringContaining('"correctOptionRef":"option-a"'),
    );
    expect(serializedPrompt).not.toContain('private/example.json');
    expect(serializedPrompt).not.toContain(
      '입력 원문 전체는 절대 전달하지 않는다',
    );
    expect(serializedPrompt).not.toContain('절대 노출하면 안 되는 별칭');
    expect(serializedPrompt).not.toContain('절대 노출하면 안 되는 원본 응답');
    expect(serializedPrompt).toContain('type-version-id');
  });

  it('canonical 승인 예시 projector가 알 수 없는 별칭을 입력 단계에서 제거한다', () => {
    const projected = projectQuestionPromptApprovedExample({
      title: '공개 예시',
      privateTitleAlias: '비공개',
      payload: {
        ...candidate.payload,
        arbitraryPrivateAlias: '비공개',
        blocks: candidate.payload.blocks.map((block) => ({
          ...block,
          arbitraryBlockAlias: '비공개',
        })),
      },
    });

    expect(projected).toEqual({
      title: '공개 예시',
      payload: candidate.payload,
    });
    expect(JSON.stringify(projected)).not.toContain('arbitraryPrivateAlias');
    expect(JSON.stringify(projected)).not.toContain('arbitraryBlockAlias');
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    '신규 보조 어휘 한도 %s는 안전한 음이 아닌 정수가 아니므로 거절한다',
    (newAuxiliaryVocabularyLimit) => {
      expect(() =>
        buildQuestionGenerationPrompt({
          ...productionContext,
          newAuxiliaryVocabularyLimit,
        }),
      ).toThrowError('QUESTION_AUXILIARY_VOCABULARY_LIMIT_INVALID');
    },
  );

  it.each([
    {
      label: '1~5 중 난이도 기준 하나가 누락되면',
      context: {
        ...productionContext,
        difficultyCriteria: productionContext.difficultyCriteria.filter(
          (criterion) => criterion.difficulty !== 3,
        ),
      },
    },
    {
      label: '난이도 기준 순서가 1~5가 아니면',
      context: {
        ...productionContext,
        difficultyCriteria: [
          productionContext.difficultyCriteria[1]!,
          productionContext.difficultyCriteria[0]!,
          ...productionContext.difficultyCriteria.slice(2),
        ],
      },
    },
    {
      label: '난이도 값이 중복되면',
      context: {
        ...productionContext,
        difficultyCriteria: productionContext.difficultyCriteria.map(
          (criterion, index) =>
            index === 2 ? { ...criterion, difficulty: 2 } : criterion,
        ),
      },
    },
    {
      label: '난이도 기준이 다섯 개보다 많으면',
      context: {
        ...productionContext,
        difficultyCriteria: [
          ...productionContext.difficultyCriteria,
          { difficulty: 6, criteria: '범위 밖 기준' },
        ],
      },
    },
    {
      label: '난이도 기준 문장이 공백이면',
      context: {
        ...productionContext,
        difficultyCriteria: productionContext.difficultyCriteria.map(
          (criterion, index) =>
            index === 2 ? { ...criterion, criteria: '   ' } : criterion,
        ),
      },
    },
    {
      label: '승인 예시가 없을 때',
      context: { ...productionContext, approvedExamples: [] },
    },
  ])('$label taxonomy 오류로 prompt 조립을 거절한다', ({ context }) => {
    expect(() => buildQuestionGenerationPrompt(context)).toThrowError(
      'QUESTION_TAXONOMY_INCOMPLETE',
    );
  });
});

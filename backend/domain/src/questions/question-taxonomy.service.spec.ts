/** 문제 유형 버전의 불변 lifecycle을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  QuestionTaxonomyRepository,
  QuestionTypeVersionRecord,
} from './question-taxonomy.repository.js';
import {
  QuestionTaxonomyError,
  QuestionTaxonomyService,
} from './question-taxonomy.service.js';

const draft = (
  overrides: Partial<QuestionTypeVersionRecord> = {},
): QuestionTypeVersionRecord => ({
  id: 'version-1',
  questionTypeId: 'type-1',
  questionTypeSlug: 'reading-vocabulary',
  version: 1,
  status: 'DRAFT',
  template: 'STANDARD_CHOICE',
  optionCount: 4,
  decisionRules: { mode: 'single-choice' },
  difficultyCriteria: [],
  approvedExamples: [],
  ...overrides,
});

const canonicalSentence = {
  originalText: 'ก',
  translationKo: '뜻',
  pronunciationKo: '꺼',
  toneMarks: '-',
  mediaAssetId: '00000000-0000-4000-8000-000000000010',
  tokens: [
    {
      surface: 'ก',
      startOffset: 0,
      endOffset: 1,
      vocabulary: { id: '00000000-0000-4000-8000-000000000011' },
      meaning: { id: '00000000-0000-4000-8000-000000000012' },
      pronunciation: { id: '00000000-0000-4000-8000-000000000013' },
      contextMeaningKo: '뜻',
      role: 'TARGET' as const,
    },
  ],
  expressions: [],
};

const standardPayload = () => ({
  questionTypeSlug: 'reading-vocabulary',
  questionTypeVersion: 1,
  difficulty: 3,
  blocks: [
    {
      kind: 'QUESTION' as const,
      displayMode: 'TEXT' as const,
      sentences: [{ speaker: null, sentence: canonicalSentence }],
    },
  ],
  options: ['a', 'b', 'c', 'd'].map((clientRef, position) => ({
    clientRef,
    position,
    sentence: canonicalSentence,
    span: null,
  })),
  correctOptionRef: 'a',
});

const repository = (version: QuestionTypeVersionRecord | null = draft()) =>
  ({
    createQuestionTypeWithDraft: vi.fn(),
    createNextDraft: vi.fn(),
    findVersion: vi.fn().mockResolvedValue(version),
    replaceDifficultyCriteria: vi.fn().mockResolvedValue('UPDATED'),
    addApprovedExample: vi.fn().mockResolvedValue('UPDATED'),
    removeApprovedExample: vi.fn().mockResolvedValue('UPDATED'),
    activateVersion: vi.fn().mockResolvedValue('ACTIVATED'),
    retireVersion: vi.fn(),
    createTerm: vi.fn(),
    archiveTerm: vi.fn(),
  }) satisfies QuestionTaxonomyRepository;

describe('QuestionTaxonomyService', () => {
  it('대분류에서 skill을 파생해 유형과 v1 DRAFT를 만든다', async () => {
    const repo = repository();
    const service = new QuestionTaxonomyService(repo);

    await service.createQuestionType({
      slug: 'listening-response',
      displayName: '반응 테스트',
      majorCategory: 'LISTENING_RESPONSE',
    });

    expect(repo.createQuestionTypeWithDraft).toHaveBeenCalledWith({
      slug: 'listening-response',
      displayName: '반응 테스트',
      majorCategory: 'LISTENING_RESPONSE',
      skill: 'LISTENING',
    });
  });

  it('DRAFT 버전에 1부터 5까지 난이도 기준을 저장한다', async () => {
    const repo = repository();
    const service = new QuestionTaxonomyService(repo);
    const criteria = [1, 2, 3, 4, 5].map((difficulty) => ({
      difficulty,
      criteria: `${difficulty}단계`,
    }));

    await service.replaceDifficultyCriteria('version-1', criteria);

    expect(repo.replaceDifficultyCriteria).toHaveBeenCalledWith(
      'version-1',
      criteria,
    );
  });

  it('승인 예시의 선택지 수와 정답 참조를 유형 버전과 대조한다', async () => {
    const repo = repository();
    const service = new QuestionTaxonomyService(repo);

    await expect(
      service.addApprovedExample('version-1', {
        title: '잘못된 예시',
        payloadHash: 'hash',
        payload: {
          ...standardPayload(),
          options: standardPayload().options.slice(0, 3),
          correctOptionRef: 'missing',
        },
      }),
    ).rejects.toMatchObject({ code: 'APPROVED_EXAMPLE_INVALID' });
    expect(repo.addApprovedExample).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: '논리 유형 slug',
      payload: { ...standardPayload(), questionTypeSlug: 'listening-response' },
    },
    {
      label: '유형 버전 번호',
      payload: { ...standardPayload(), questionTypeVersion: 2 },
    },
  ])(
    '승인 예시 payload의 $label가 대상 유형 버전과 다르면 거부한다',
    async ({ payload }) => {
      const repo = repository();
      const service = new QuestionTaxonomyService(repo);

      await expect(
        service.addApprovedExample('version-1', {
          title: '다른 유형 예시',
          payloadHash: 'hash',
          payload,
        }),
      ).rejects.toMatchObject({ code: 'APPROVED_EXAMPLE_INVALID' });
      expect(repo.addApprovedExample).not.toHaveBeenCalled();
    },
  );

  it('다섯 난이도 기준과 승인 예시가 있어야 활성화한다', async () => {
    const ready = draft({
      difficultyCriteria: [1, 2, 3, 4, 5].map((difficulty) => ({
        difficulty,
        criteria: `${difficulty}단계`,
      })),
      approvedExamples: [
        {
          id: 'example-1',
          title: '기본 예시',
          payloadHash: 'hash',
          payload: standardPayload(),
        },
      ],
    });
    const repo = repository(ready);
    const service = new QuestionTaxonomyService(repo);

    await service.activateVersion('version-1');

    expect(repo.activateVersion).toHaveBeenCalledWith('version-1');
  });

  it('승인 예시 block 구조가 유형 템플릿과 다르면 거부한다', async () => {
    const repo = repository(
      draft({ template: 'PASSAGE_CHOICE', optionCount: 4 }),
    );
    const service = new QuestionTaxonomyService(repo);

    await expect(
      service.addApprovedExample('version-1', {
        title: '지문이 없는 예시',
        payloadHash: 'hash',
        payload: standardPayload(),
      }),
    ).rejects.toMatchObject({ code: 'APPROVED_EXAMPLE_INVALID' });
  });

  it('대화 승인 예시는 모든 대화 문장에 speaker를 요구한다', async () => {
    const repo = repository(draft({ template: 'DIALOGUE_CHOICE' }));
    const service = new QuestionTaxonomyService(repo);

    await expect(
      service.addApprovedExample('version-1', {
        title: 'speaker가 없는 대화',
        payloadHash: 'hash',
        payload: {
          questionTypeSlug: 'reading-vocabulary',
          questionTypeVersion: 1,
          difficulty: 3,
          blocks: [
            {
              kind: 'DIALOGUE',
              displayMode: 'TEXT',
              sentences: [{ speaker: null, sentence: canonicalSentence }],
            },
            {
              kind: 'QUESTION',
              displayMode: 'TEXT',
              sentences: [{ speaker: null, sentence: canonicalSentence }],
            },
          ],
          options: ['a', 'b', 'c', 'd'].map((clientRef, position) => ({
            clientRef,
            position,
            sentence: canonicalSentence,
            span: null,
          })),
          correctOptionRef: 'a',
        },
      }),
    ).rejects.toMatchObject({ code: 'APPROVED_EXAMPLE_INVALID' });
    expect(repo.addApprovedExample).not.toHaveBeenCalled();
  });

  it('inline 승인 예시는 QUESTION token 안의 중복 없는 범위만 허용한다', async () => {
    const repo = repository(draft({ template: 'INLINE_SPAN_CHOICE' }));
    const service = new QuestionTaxonomyService(repo);

    await expect(
      service.addApprovedExample('version-1', {
        title: '범위를 벗어난 inline 예시',
        payloadHash: 'hash',
        payload: {
          questionTypeSlug: 'reading-vocabulary',
          questionTypeVersion: 1,
          difficulty: 3,
          blocks: [
            {
              kind: 'QUESTION',
              displayMode: 'TEXT',
              sentences: [{ speaker: null, sentence: canonicalSentence }],
            },
          ],
          options: ['a', 'b', 'c', 'd'].map((clientRef, position) => ({
            clientRef,
            position,
            sentence: null,
            span: {
              blockPosition: 0,
              sentencePosition: 0,
              startTokenIndex: 0,
              endTokenIndex: position === 0 ? 2 : 1,
            },
          })),
          correctOptionRef: 'a',
        },
      }),
    ).rejects.toMatchObject({ code: 'APPROVED_EXAMPLE_INVALID' });
    expect(repo.addApprovedExample).not.toHaveBeenCalled();
  });

  it('준비되지 않은 버전과 활성 버전의 내용 변경을 거부한다', async () => {
    const incompleteService = new QuestionTaxonomyService(repository());
    await expect(
      incompleteService.activateVersion('version-1'),
    ).rejects.toBeInstanceOf(QuestionTaxonomyError);

    const activeRepo = repository(draft({ status: 'ACTIVE' }));
    const activeService = new QuestionTaxonomyService(activeRepo);
    await expect(
      activeService.replaceDifficultyCriteria('version-1', [
        { difficulty: 1, criteria: '기준' },
      ]),
    ).rejects.toMatchObject({ code: 'TYPE_VERSION_IMMUTABLE' });
  });

  it('난이도 기준 저장 직전 DRAFT가 아니게 되면 변경을 거부한다', async () => {
    const repo = repository();
    vi.mocked(repo.replaceDifficultyCriteria).mockResolvedValue('IMMUTABLE');
    const service = new QuestionTaxonomyService(repo);

    await expect(
      service.replaceDifficultyCriteria(
        'version-1',
        [1, 2, 3, 4, 5].map((difficulty) => ({
          difficulty,
          criteria: `${difficulty}단계`,
        })),
      ),
    ).rejects.toMatchObject({ code: 'TYPE_VERSION_IMMUTABLE' });
  });

  it('승인 예시 저장 직전 DRAFT가 아니게 되면 변경을 거부한다', async () => {
    const repo = repository();
    vi.mocked(repo.addApprovedExample).mockResolvedValue('IMMUTABLE');
    const service = new QuestionTaxonomyService(repo);

    await expect(
      service.addApprovedExample('version-1', {
        title: '기본 예시',
        payloadHash: 'hash',
        payload: standardPayload(),
      }),
    ).rejects.toMatchObject({ code: 'TYPE_VERSION_IMMUTABLE' });
  });

  it('활성화 transaction에서 준비 조건이 사라지면 활성화를 거부한다', async () => {
    const ready = draft({
      difficultyCriteria: [1, 2, 3, 4, 5].map((difficulty) => ({
        difficulty,
        criteria: `${difficulty}단계`,
      })),
      approvedExamples: [
        {
          title: '기본 예시',
          payloadHash: 'hash',
          payload: standardPayload(),
        },
      ],
    });
    const repo = repository(ready);
    vi.mocked(repo.activateVersion).mockResolvedValue('NOT_READY');
    const service = new QuestionTaxonomyService(repo);

    await expect(service.activateVersion('version-1')).rejects.toMatchObject({
      code: 'TYPE_VERSION_NOT_READY',
    });
  });

  it('ACTIVE 버전만 RETIRED로 전환한다', async () => {
    const repo = repository(draft({ status: 'ACTIVE' }));
    const service = new QuestionTaxonomyService(repo);

    await service.retireVersion('version-1');

    expect(repo.retireVersion).toHaveBeenCalledWith('version-1');
  });
});

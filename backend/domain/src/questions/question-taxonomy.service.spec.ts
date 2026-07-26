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
  version: 1,
  status: 'DRAFT',
  template: 'STANDARD_CHOICE',
  optionCount: 4,
  decisionRules: { mode: 'single-choice' },
  difficultyCriteria: [],
  approvedExamples: [],
  ...overrides,
});

const repository = (
  version: QuestionTypeVersionRecord | null = draft(),
): QuestionTaxonomyRepository => ({
  createQuestionTypeWithDraft: vi.fn(),
  createNextDraft: vi.fn(),
  findVersion: vi.fn().mockResolvedValue(version),
  replaceDifficultyCriteria: vi.fn(),
  addApprovedExample: vi.fn(),
  removeApprovedExample: vi.fn(),
  activateVersion: vi.fn(),
  retireVersion: vi.fn(),
  createTerm: vi.fn(),
  archiveTerm: vi.fn(),
});

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
          difficulty: 3,
          options: [
            { clientRef: 'a' },
            { clientRef: 'b' },
            { clientRef: 'c' },
          ],
          correctOptionRef: 'missing',
        },
      }),
    ).rejects.toMatchObject({ code: 'APPROVED_EXAMPLE_INVALID' });
    expect(repo.addApprovedExample).not.toHaveBeenCalled();
  });

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
          payload: {
            difficulty: 3,
            options: [
              { clientRef: 'a' },
              { clientRef: 'b' },
              { clientRef: 'c' },
              { clientRef: 'd' },
            ],
            correctOptionRef: 'a',
          },
        },
      ],
    });
    const repo = repository(ready);
    const service = new QuestionTaxonomyService(repo);

    await service.activateVersion('version-1');

    expect(repo.activateVersion).toHaveBeenCalledWith('version-1');
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

  it('ACTIVE 버전만 RETIRED로 전환한다', async () => {
    const repo = repository(draft({ status: 'ACTIVE' }));
    const service = new QuestionTaxonomyService(repo);

    await service.retireVersion('version-1');

    expect(repo.retireVersion).toHaveBeenCalledWith('version-1');
  });
});

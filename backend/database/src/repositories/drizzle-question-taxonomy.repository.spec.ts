/** 문제 분류 설정 adapter의 기본 버전과 잠금 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  defaultQuestionTypeVersionSettings,
  DrizzleQuestionTaxonomyRepository,
} from './drizzle-question-taxonomy.repository.js';

describe('문제 분류 설정 기본 버전', () => {
  it('듣기 반응 테스트는 3지선다 STANDARD_CHOICE를 사용한다', () => {
    expect(defaultQuestionTypeVersionSettings('LISTENING_RESPONSE')).toEqual({
      template: 'STANDARD_CHOICE',
      optionCount: 3,
      decisionRules: { mode: 'single-choice' },
    });
  });

  it('읽기 비문 찾기는 4개 inline span을 사용한다', () => {
    expect(
      defaultQuestionTypeVersionSettings('READING_ERROR_IDENTIFICATION'),
    ).toEqual({
      template: 'INLINE_SPAN_CHOICE',
      optionCount: 4,
      decisionRules: { mode: 'single-choice' },
    });
  });
});

describe('문제 분류 설정 transaction 불변식', () => {
  it('난이도 기준 교체 전에 버전을 잠그고 DRAFT 상태를 다시 확인한다', async () => {
    const fake = createMutationFake([[{ status: 'ACTIVE' }]]);
    const repository = new DrizzleQuestionTaxonomyRepository(
      fake.database as never,
    );

    await expect(
      repository.replaceDifficultyCriteria(
        '00000000-0000-4000-8000-000000000001',
        [1, 2, 3, 4, 5].map((difficulty) => ({
          difficulty,
          criteria: `${difficulty}단계`,
        })),
      ),
    ).resolves.toBe('IMMUTABLE');

    expect(fake.forUpdate).toHaveBeenCalledOnce();
    expect(fake.remove).not.toHaveBeenCalled();
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it('활성화 직전에 잠근 DRAFT의 기준과 예시를 다시 세어 준비 상태를 확인한다', async () => {
    const fake = createMutationFake([
      [
        {
          questionTypeId: '00000000-0000-4000-8000-000000000002',
          status: 'DRAFT',
        },
      ],
      [{ total: 4 }],
      [{ total: 1 }],
    ]);
    const repository = new DrizzleQuestionTaxonomyRepository(
      fake.database as never,
    );

    await expect(
      repository.activateVersion('00000000-0000-4000-8000-000000000001'),
    ).resolves.toBe('NOT_READY');

    expect(fake.forUpdate).toHaveBeenCalledOnce();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('동시 next-version 생성의 unique loser를 taxonomy conflict로 바꾼다', async () => {
    const duplicate = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'question_type_versions_type_version_unique',
    });
    const fake = createMutationFake([[{ nextVersion: 2 }]], {
      insertError: duplicate,
    });
    const repository = new DrizzleQuestionTaxonomyRepository(
      fake.database as never,
    );

    await expect(
      repository.createNextDraft('00000000-0000-4000-8000-000000000001', {
        template: 'STANDARD_CHOICE',
        optionCount: 4,
        decisionRules: {},
      }),
    ).rejects.toMatchObject({ code: 'TAXONOMY_CONFLICT' });
  });

  it('동시 activation의 ACTIVE unique loser를 taxonomy conflict로 바꾼다', async () => {
    const duplicate = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'question_type_versions_one_active_per_type',
    });
    const fake = createMutationFake(
      [
        [
          {
            questionTypeId: '00000000-0000-4000-8000-000000000002',
            status: 'DRAFT',
          },
        ],
        [{ total: 5 }],
        [{ total: 1 }],
      ],
      {
        returningError: duplicate,
      },
    );
    const repository = new DrizzleQuestionTaxonomyRepository(
      fake.database as never,
    );

    await expect(
      repository.activateVersion('00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ code: 'TAXONOMY_CONFLICT' });
  });

  it('알려진 topic slug unique 제약만 taxonomy conflict 도메인 오류로 바꾼다', async () => {
    const duplicate = {
      code: '23505',
      constraint: 'question_topics_slug_unique',
    };
    const repository = new DrizzleQuestionTaxonomyRepository({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockRejectedValue(duplicate),
        })),
      })),
    } as never);

    await expect(
      repository.createTerm('TOPIC', {
        slug: 'general',
        displayName: '일반',
      }),
    ).rejects.toMatchObject({ code: 'TAXONOMY_CONFLICT' });
  });

  it('알려지지 않은 unique 제약 오류는 원본으로 유지한다', async () => {
    const unexpected = {
      code: '23505',
      constraint: 'unrelated_unique_constraint',
    };
    const repository = new DrizzleQuestionTaxonomyRepository({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockRejectedValue(unexpected),
        })),
      })),
    } as never);

    await expect(
      repository.createTerm('TOPIC', {
        slug: 'general',
        displayName: '일반',
      }),
    ).rejects.toBe(unexpected);
  });
});

const createMutationFake = (
  selectResults: unknown[][],
  options: { insertError?: Error; returningError?: Error } = {},
) => {
  const pendingResults = [...selectResults];
  const forUpdate = vi.fn();
  const remove = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const session = {
    select: vi.fn(() => {
      const consume = () => pendingResults.shift() ?? [];
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        for: vi.fn(() => {
          forUpdate();
          return chain;
        }),
        limit: vi.fn(() => Promise.resolve(consume())),
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (error: unknown) => unknown,
        ) => Promise.resolve(consume()).then(resolve, reject),
      };
      return chain;
    }),
    delete: vi.fn(() => {
      remove();
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
    insert: vi.fn(() => {
      insert();
      return {
        values: options.insertError
          ? vi.fn().mockRejectedValue(options.insertError)
          : vi.fn().mockResolvedValue(undefined),
      };
    }),
    update: vi.fn(() => {
      update();
      const chain = {
        set: vi.fn(() => chain),
        where: vi.fn(() => chain),
        returning: vi.fn().mockImplementation(() => {
          if (options.returningError) {
            return Promise.reject(options.returningError);
          }
          return Promise.resolve([
            { id: '00000000-0000-4000-8000-000000000001' },
          ]);
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(undefined).then(resolve),
      };
      return chain;
    }),
  };
  return {
    database: {
      ...session,
      transaction: (work: (transaction: typeof session) => unknown) =>
        work(session),
    },
    forUpdate,
    insert,
    remove,
    update,
  };
};

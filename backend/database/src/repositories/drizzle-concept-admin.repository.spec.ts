/** 개념 관리자 repository의 정렬과 게시 조건을 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  assembleConceptValidationCandidate,
  ConceptPersistenceError,
  DrizzleConceptAdminRepository,
  draftRevisionCondition,
  publishableVersionCondition,
} from './drizzle-concept-admin.repository.js';

const context = {
  actorSub: 'admin-sub',
  actorUserId: '11111111-1111-4111-8111-111111111111',
  requestId: 'request-1',
  occurredAt: new Date('2026-07-26T00:00:00.000Z'),
};

describe('assembleConceptValidationCandidate', () => {
  it('블록과 예시를 position 순으로 결정적으로 조립한다', () => {
    const candidate = assembleConceptValidationCandidate(
      {
        id: 'version-1',
        conceptId: 'concept-1',
        revision: 2,
        status: 'DRAFT',
        validationStatus: 'PENDING',
        validatedRevision: null,
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '요약',
      },
      [
        {
          id: 'block-2',
          kind: 'EXPLANATION',
          position: 1,
          heading: '둘째',
          paragraphs: ['둘째'],
          tableHeaders: null,
          tableRows: null,
        },
        {
          id: 'block-1',
          kind: 'THAI_EXAMPLES',
          position: 0,
          heading: '첫째',
          paragraphs: null,
          tableHeaders: null,
          tableRows: null,
        },
      ],
      [
        {
          blockId: 'block-1',
          position: 1,
          sentenceVersionId: 'sentence-2',
          noteKo: null,
          sentenceExists: true,
          audioAssetExists: true,
          audioAssetStatus: 'READY',
          interactionIssues: [],
        },
        {
          blockId: 'block-1',
          position: 0,
          sentenceVersionId: 'sentence-1',
          noteKo: null,
          sentenceExists: true,
          audioAssetExists: true,
          audioAssetStatus: 'READY',
          interactionIssues: [],
        },
      ],
    );

    expect(candidate.blocks.map(({ heading }) => heading)).toEqual([
      '첫째',
      '둘째',
    ]);
    const first = candidate.blocks[0];
    expect(first?.kind).toBe('THAI_EXAMPLES');
    if (first?.kind === 'THAI_EXAMPLES') {
      expect(first.examples.map(({ sentenceVersionId }) => sentenceVersionId))
        .toEqual(['sentence-1', 'sentence-2']);
    }
  });
});

describe('DrizzleConceptAdminRepository 상태 전이', () => {
  it('게시 조건이 DRAFT·PASSED와 현재 검증 revision을 함께 요구한다', () => {
    const publishParams = new PgDialect().sqlToQuery(
      publishableVersionCondition('version-1', 3),
    ).params;
    const draftParams = new PgDialect().sqlToQuery(
      draftRevisionCondition('version-1', 3),
    ).params;

    expect(publishParams).toEqual(
      expect.arrayContaining(['version-1', 'DRAFT', 'PASSED', 3]),
    );
    expect(publishParams.filter((value) => value === 3)).toHaveLength(2);
    expect(draftParams).toEqual(
      expect.arrayContaining(['version-1', 'DRAFT', 3]),
    );
  });

  it('숨김 상태 전이와 감사 기록을 같은 transaction에서 실행한다', async () => {
    const auditValues: unknown[] = [];
    const session = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'concept-1' }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values) => {
          auditValues.push(values);
          return Promise.resolve();
        }),
      })),
    };
    const database = {
      transaction: vi.fn(async (work) => work(session)),
    };
    const repository = new DrizzleConceptAdminRepository(database as never);

    await repository.hide('concept-1', context);

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(auditValues).toEqual([
      expect.objectContaining({
        action: 'CONCEPT_HIDDEN',
        targetId: 'concept-1',
      }),
    ]);
  });

  it('초안 교체 실패를 없음·불변·revision 충돌로 구분한다', async () => {
    const cases = [
      { current: undefined, code: 'CONCEPT_VERSION_NOT_FOUND' },
      {
        current: { status: 'PUBLISHED', revision: 1 },
        code: 'CONCEPT_VERSION_IMMUTABLE',
      },
      {
        current: { status: 'DRAFT', revision: 2 },
        code: 'CONCEPT_REVISION_CONFLICT',
      },
    ] as const;

    for (const testCase of cases) {
      const select = vi.fn(() => {
        const chain = {
          from: vi.fn(),
          where: vi.fn(),
          limit: vi.fn().mockResolvedValue(
            testCase.current ? [testCase.current] : [],
          ),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      });
      const session = {
        select,
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      };
      const database = {
        transaction: vi.fn(async (work) => work(session)),
      };
      const repository = new DrizzleConceptAdminRepository(database as never);

      await expect(
        repository.replaceDraft(
          'version-1',
          {
            revision: 1,
            category: 'GRAMMAR',
            position: 0,
            title: '제목',
            summary: '요약',
            blocks: [],
          },
          context,
        ),
      ).rejects.toMatchObject({
        code: testCase.code,
      });
    }
  });
});

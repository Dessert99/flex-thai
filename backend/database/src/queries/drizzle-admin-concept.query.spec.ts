/** 관리자 개념 상세의 버전·블록 정렬을 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  adminConceptOffset,
  assembleAdminConceptDetail,
  buildAdminConceptConditions,
} from './drizzle-admin-concept.query.js';

describe('assembleAdminConceptDetail', () => {
  it('버전을 내림차순으로 정렬하고 각 블록을 position 순으로 조립한다', () => {
    const detail = assembleAdminConceptDetail(
      {
        id: 'concept-1',
        status: 'PUBLISHED',
        currentPublishedVersionId: 'version-1',
      },
      [
        {
          id: 'version-1',
          conceptId: 'concept-1',
          version: 1,
          revision: 0,
          category: 'GRAMMAR',
          position: 0,
          title: '첫 버전',
          summary: '요약',
          status: 'PUBLISHED',
          validationStatus: 'PASSED',
          validationIssues: [],
          validatedAt: new Date('2026-07-26T00:00:00.000Z'),
          publishedAt: new Date('2026-07-26T00:00:00.000Z'),
        },
        {
          id: 'version-2',
          conceptId: 'concept-1',
          version: 2,
          revision: 1,
          category: 'GRAMMAR',
          position: 0,
          title: '둘째 버전',
          summary: '요약',
          status: 'DRAFT',
          validationStatus: 'PENDING',
          validationIssues: [],
          validatedAt: null,
          publishedAt: null,
        },
      ],
      [],
      [],
    );

    expect(detail?.versions.map(({ version }) => version)).toEqual([2, 1]);
  });

  it('관리자 category/status 필터와 pagination offset을 고정한다', () => {
    const filter = {
      category: 'GRAMMAR' as const,
      status: 'HIDDEN' as const,
      page: 3,
      pageSize: 20,
    };
    const params = buildAdminConceptConditions(filter).flatMap(
      (condition) => new PgDialect().sqlToQuery(condition).params,
    );

    expect(params).toEqual(expect.arrayContaining(['GRAMMAR', 'HIDDEN']));
    expect(adminConceptOffset(filter)).toBe(40);
  });
});

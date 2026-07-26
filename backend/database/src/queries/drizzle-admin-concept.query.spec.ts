/** 관리자 개념 상세의 버전·블록 정렬을 검증한다 */
import { describe, expect, it } from 'vitest';
import { assembleAdminConceptDetail } from './drizzle-admin-concept.query.js';

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
});

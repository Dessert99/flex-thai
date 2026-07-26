/** 개념 관리자 repository의 정렬과 게시 조건을 검증한다 */
import { describe, expect, it } from 'vitest';
import { assembleConceptValidationCandidate } from './drizzle-concept-admin.repository.js';

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
        },
        {
          blockId: 'block-1',
          position: 0,
          sentenceVersionId: 'sentence-1',
          noteKo: null,
          sentenceExists: true,
          audioAssetExists: true,
          audioAssetStatus: 'READY',
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

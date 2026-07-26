/** 학습자 개념 graph의 정렬과 목차 파생을 검증한다 */
import { describe, expect, it } from 'vitest';
import { assembleLearnerConceptDetail } from './drizzle-learner-concept.query.js';

describe('assembleLearnerConceptDetail', () => {
  it('블록을 정렬하고 제목에서 목차를 파생한다', () => {
    const detail = assembleLearnerConceptDetail(
      {
        id: 'concept-1',
        versionId: 'version-1',
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
          paragraphs: ['본문'],
          tableHeaders: null,
          tableRows: null,
        },
        {
          id: 'block-1',
          kind: 'RULE_TABLE',
          position: 0,
          heading: '첫째',
          paragraphs: null,
          tableHeaders: ['순서'],
          tableRows: [['1']],
        },
      ],
      [],
    );

    expect(detail.tableOfContents).toEqual([
      { blockId: 'block-1', heading: '첫째', position: 0 },
      { blockId: 'block-2', heading: '둘째', position: 1 },
    ]);
  });
});

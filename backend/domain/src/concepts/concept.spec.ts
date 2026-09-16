/** 개념 초안의 결정적 구조·참조 검증을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  validateConceptCandidate,
  type ConceptValidationCandidate,
} from './concept.js';

const candidate = (): ConceptValidationCandidate => ({
  id: 'version-1',
  conceptId: 'concept-1',
  revision: 2,
  status: 'DRAFT',
  validationStatus: 'PENDING',
  validatedRevision: null,
  category: 'GRAMMAR',
  position: 0,
  title: '기본 어순',
  summary: '태국어 기본 어순',
  blocks: [
    {
      id: 'block-1',
      kind: 'THAI_EXAMPLES',
      position: 0,
      heading: '예문',
      examples: [
        {
          position: 0,
          sentenceVersionId: 'sentence-1',
          noteKo: null,
          sentenceExists: true,
          interactionIssues: [],
        },
      ],
    },
  ],
});

describe('validateConceptCandidate', () => {
  it('정상 초안에는 구조·참조 문제가 없다', () => {
    expect(validateConceptCandidate(candidate())).toEqual([]);
  });

  it('표의 열 수와 같은 블록의 중복 문장을 거부한다', () => {
    const input = candidate();
    input.blocks = [
      {
        id: 'block-1',
        kind: 'RULE_TABLE',
        position: 0,
        heading: '규칙',
        headers: ['순서', '역할'],
        rows: [['1']],
      },
      {
        id: 'block-2',
        kind: 'THAI_EXAMPLES',
        position: 1,
        heading: '예문',
        examples: [
          {
            position: 0,
            sentenceVersionId: 'sentence-1',
            noteKo: null,
            sentenceExists: true,
            interactionIssues: [],
          },
          {
            position: 1,
            sentenceVersionId: 'sentence-1',
            noteKo: null,
            sentenceExists: true,
            interactionIssues: [],
          },
        ],
      },
    ];

    expect(validateConceptCandidate(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONCEPT_RULE_COLUMN_MISMATCH' }),
        expect.objectContaining({ code: 'CONCEPT_DUPLICATE_SENTENCE' }),
      ]),
    );
  });
});

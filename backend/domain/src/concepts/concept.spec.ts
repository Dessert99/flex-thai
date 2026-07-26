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
          audioAssetExists: true,
          audioAssetStatus: 'READY',
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

  it('끊어진 블록 순서와 준비되지 않은 음성을 경로별로 보고한다', () => {
    const input = candidate();
    input.blocks[0]!.position = 1;
    const example = input.blocks[0]!;
    if (example.kind === 'THAI_EXAMPLES') {
      example.examples[0]!.audioAssetStatus = 'UPLOADING';
    }

    expect(validateConceptCandidate(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONCEPT_BLOCK_POSITION_GAP' }),
        expect.objectContaining({ code: 'CONCEPT_AUDIO_NOT_READY' }),
      ]),
    );
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
            audioAssetExists: true,
            audioAssetStatus: 'READY',
            interactionIssues: [],
          },
          {
            position: 1,
            sentenceVersionId: 'sentence-1',
            noteKo: null,
            sentenceExists: true,
            audioAssetExists: true,
            audioAssetStatus: 'READY',
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

  it('token과 expression의 참조·음성이 준비되지 않으면 게시 검증에 실패한다', () => {
    const input = candidate();
    const block = input.blocks[0];
    if (block?.kind === 'THAI_EXAMPLES') {
      block.examples[0]!.interactionIssues = [
        {
          kind: 'TOKEN',
          index: 0,
          referenceValid: true,
          audioAssetExists: true,
          audioAssetStatus: 'UPLOADING',
        },
        {
          kind: 'EXPRESSION',
          index: 0,
          referenceValid: false,
          audioAssetExists: false,
          audioAssetStatus: null,
        },
      ];
    }

    expect(validateConceptCandidate(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONCEPT_FEEDBACK_AUDIO_NOT_READY' }),
        expect.objectContaining({
          code: 'CONCEPT_FEEDBACK_REFERENCE_NOT_FOUND',
        }),
      ]),
    );
  });
});

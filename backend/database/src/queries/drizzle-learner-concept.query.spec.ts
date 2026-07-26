/** 학습자 개념 graph의 정렬과 목차 파생을 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  assembleLearnerConceptDetail,
  assertCompleteConceptGraph,
  DrizzleLearnerConceptQuery,
  publishedConceptCondition,
} from './drizzle-learner-concept.query.js';

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

  it('정상 예문의 token과 expression 개수를 손실 없이 보존한다', () => {
    const sentence = {
      sentenceVersionId: 'sentence-1',
      originalText: 'ฉันเรียนภาษาไทย',
      translationKo: '나는 태국어를 공부한다',
      pronunciationKo: '찬 리안 파싸 타이',
      toneMarks: '',
      media: { storageKey: 'sentence.mp3' },
      tokens: [{
        position: 0,
        surface: 'ฉัน',
        startOffset: 0,
        endOffset: 3,
        vocabularyId: 'word-1',
        meaningId: 'meaning-1',
        pronunciationId: 'pronunciation-1',
        contextMeaningKo: '나',
        pronunciationKo: '찬',
        toneMarks: '',
        media: { storageKey: 'token.mp3' },
        role: 'TARGET' as const,
      }],
      expressions: [{
        startTokenIndex: 0,
        endTokenIndex: 1,
        vocabularyId: 'expression-1',
        meaningId: 'meaning-2',
        pronunciationId: 'pronunciation-2',
        contextMeaningKo: '나',
        pronunciationKo: '찬',
        toneMarks: '',
        media: { storageKey: 'expression.mp3' },
        representative: true,
      }],
    };
    const detail = assembleLearnerConceptDetail(
      {
        id: 'concept-1',
        versionId: 'version-1',
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '요약',
      },
      [{
        id: 'block-1',
        kind: 'THAI_EXAMPLES',
        position: 0,
        heading: '예문',
        paragraphs: null,
        tableHeaders: null,
        tableRows: null,
      }],
      [{ blockId: 'block-1', position: 0, noteKo: null, sentence }],
    );
    const block = detail.blocks[0];
    expect(block?.kind).toBe('THAI_EXAMPLES');
    if (block?.kind === 'THAI_EXAMPLES') {
      expect(block.examples[0]?.sentence.tokens).toHaveLength(1);
      expect(block.examples[0]?.sentence.expressions).toHaveLength(1);
    }
  });

  it('목록 SQL이 logical/current 게시 상태와 category를 모두 요구한다', async () => {
    let condition: unknown;
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    chain.where.mockImplementation((value) => {
      condition = value;
      return chain;
    });
    const query = new DrizzleLearnerConceptQuery({
      select: vi.fn(() => chain),
    } as never);

    await query.list('GRAMMAR');

    const compiled = new PgDialect().sqlToQuery(condition as never);
    expect(compiled.params).toEqual(
      expect.arrayContaining(['PUBLISHED', 'GRAMMAR']),
    );
    expect(compiled.params.filter((value) => value === 'PUBLISHED')).toHaveLength(2);
    expect(chain.orderBy).toHaveBeenCalled();
  });

  it('상세 SQL도 숨김·stale 버전을 제외하고 요청 ID를 요구한다', () => {
    const compiled = new PgDialect().sqlToQuery(
      publishedConceptCondition({ conceptId: 'concept-1' }),
    );

    expect(compiled.params.filter((value) => value === 'PUBLISHED')).toHaveLength(2);
    expect(compiled.params).toContain('concept-1');
  });

  it('게시 후 READY graph가 훼손되면 부분 응답 대신 실패한다', () => {
    expect(() =>
      assertCompleteConceptGraph({
        exampleReferences: 1,
        readySentences: 1,
        tokenOccurrences: 2,
        readyTokens: 1,
        expressionOccurrences: 1,
        readyExpressions: 1,
      }),
    ).toThrowError('PUBLISHED_CONCEPT_GRAPH_INVALID:feedbackGraph');
    expect(() =>
      assertCompleteConceptGraph({
        exampleReferences: 1,
        readySentences: 0,
        tokenOccurrences: 0,
        readyTokens: 0,
        expressionOccurrences: 0,
        readyExpressions: 0,
      }),
    ).toThrowError('PUBLISHED_CONCEPT_GRAPH_INVALID:sentenceGraph');
  });
});

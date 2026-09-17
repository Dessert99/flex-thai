/** 공유 입력 발음의 복사와 뜻별 단일 발음 경계를 검증한다. */
import { describe, expect, it } from 'vitest';
import { vocabularyMeaningRows } from './vocabulary-meaning-rows.js';

const graph = () => ({
  meanings: [
    { id: 'm1', vocabularyId: 'v', meaningKo: '첫 뜻' },
    { id: 'm2', vocabularyId: 'v', meaningKo: '둘째 뜻' },
  ],
  pronunciations: [
    { id: 'p', vocabularyId: 'v', pronunciationKo: '발음', toneMarks: 'M' },
  ],
  meaningPronunciations: [
    { vocabularyId: 'v', meaningId: 'm1', pronunciationId: 'p' },
    { vocabularyId: 'v', meaningId: 'm2', pronunciationId: 'p' },
  ],
});

describe('뜻과 발음 통합 저장', () => {
  it('공유 발음을 각 뜻에 복사해 한 뜻의 수정이 다른 뜻을 바꾸지 않는다', () => {
    const input = graph();
    const rows = vocabularyMeaningRows(input);
    expect(rows).toEqual(
      input.meanings.map((meaning) => ({
        ...meaning,
        pronunciationKo: '발음',
        toneMarks: 'M',
      })),
    );
    rows[0]!.pronunciationKo = '수정';
    expect(rows[1]!.pronunciationKo).toBe('발음');
    expect(input.pronunciations[0]!.pronunciationKo).toBe('발음');
  });
  it('뜻별로 다른 발음과 성조도 보존한다', () => {
    const input = graph();
    input.pronunciations.push({
      id: 'p2',
      vocabularyId: 'v',
      pronunciationKo: '다른 발음',
      toneMarks: 'H',
    });
    input.meaningPronunciations[1]!.pronunciationId = 'p2';
    expect(vocabularyMeaningRows(input)[1]).toMatchObject({
      pronunciationKo: '다른 발음',
      toneMarks: 'H',
    });
  });
  it('발음이 없거나 여러 개인 뜻을 임의로 저장하지 않는다', () => {
    const missing = graph();
    missing.meaningPronunciations.pop();
    expect(() => vocabularyMeaningRows(missing)).toThrow('exactly one');
    const multiple = graph();
    multiple.meaningPronunciations.push({
      ...multiple.meaningPronunciations[0]!,
    });
    expect(() => vocabularyMeaningRows(multiple)).toThrow('exactly one');
  });
  it('다른 어휘의 발음을 연결할 수 없다', () => {
    const input = graph();
    input.pronunciations[0]!.vocabularyId = 'other';
    expect(() => vocabularyMeaningRows(input)).toThrow('exactly one');
  });
});

import { describe, expect, it } from 'vitest';
import {
  selectVocabularyForQuestions,
  vocabularySelectionScore,
} from './vocabulary-selection.js';
describe('중요도와 출제 실적에 따른 어휘 선정', () => {
  const words = [
    { vocabularyId: 'a', importanceWeight: 10, targetQuestionCount: 4 },
    { vocabularyId: 'b', importanceWeight: 5, targetQuestionCount: 0 },
    { vocabularyId: 'c', importanceWeight: 3, targetQuestionCount: 0 },
  ];
  it('중요도가 높아도 이미 많이 출제된 단어보다 부족한 단어를 먼저 선택한다', () => {
    expect(vocabularySelectionScore(words[0]!)).toBe(2);
    expect(selectVocabularyForQuestions(words, 1, 1)).toEqual([['b']]);
  });
  it('묶음 안의 선택 횟수를 반영하고 입력 실적을 변경하지 않는다', () => {
    expect(selectVocabularyForQuestions(words, 3, 1)).toEqual([
      ['b'],
      ['c'],
      ['b'],
    ]);
    expect(words.map((word) => word.targetQuestionCount)).toEqual([4, 0, 0]);
  });
  it('한 문제에서 중복 선택하지 않고 동점은 ID 순서로 결정한다', () => {
    const tied = ['b', 'a'].map((vocabularyId) => ({
      vocabularyId,
      importanceWeight: 5,
      targetQuestionCount: 0,
    }));
    expect(selectVocabularyForQuestions(tied, 2, 2)).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ]);
  });
  it('후보 부족과 잘못된 가중치를 거부한다', () => {
    expect(() => selectVocabularyForQuestions(words, 1, 4)).toThrow(
      'VOCABULARY_SELECTION_INVALID',
    );
    expect(() =>
      selectVocabularyForQuestions(
        [{ ...words[0]!, importanceWeight: 11 }],
        1,
        1,
      ),
    ).toThrow('VOCABULARY_SELECTION_INVALID');
  });
});

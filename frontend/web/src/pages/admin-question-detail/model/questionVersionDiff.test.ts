/** 문제 버전의 구조·내용 diff 분류를 검증한다 */
import { describe, expect, it } from 'vitest';
import { compareQuestionVersions } from './questionVersionDiff';

describe('문제 버전 비교', () => {
  it('본문·보기·정답·해설·상태 차이를 독립 항목으로 반환한다', () => {
    const base = version('DRAFT', '질문 A', '보기 A', '정답 A', '해설 A');
    const target = version('PUBLISHED', '질문 B', '보기 B', '정답 B', '해설 B');

    expect(
      compareQuestionVersions(base as never, target as never).map(
        ({ kind }) => kind,
      ),
    ).toEqual(['STATUS', 'BODY', 'OPTIONS', 'CORRECT_ANSWER', 'EXPLANATION']);
  });
});

function version(
  status: 'DRAFT' | 'PUBLISHED',
  body: string,
  option: string,
  correct: string,
  explanation: string,
) {
  return {
    status,
    blocks: [block('QUESTION', body), block('EXPLANATION', explanation)],
    options: [
      { id: correct, position: 0, displayText: option },
      { id: 'wrong', position: 1, displayText: '오답' },
    ],
    correctOptionId: correct,
  };
}

function block(kind: 'QUESTION' | 'EXPLANATION', text: string) {
  return {
    kind,
    position: kind === 'QUESTION' ? 0 : 1,
    sentences: [{ position: 0, sentence: { originalText: text } }],
  };
}

/** 문제 block의 순서와 문장 표시 정보를 보존하는 변환을 검증한다 */
import type { QuestionDetailResponse } from '@flex-thia/contracts';
import { describe, expect, it } from 'vitest';
import { toQuestionBlockViewModels } from './questionViewModel';

describe('문제 block view model', () => {
  it('block과 내부 문장을 position 순서로 정렬하고 화자를 보존한다', () => {
    const detail = createDetail();

    expect(toQuestionBlockViewModels(detail)).toMatchObject([
      {
        id: 'block-early',
        kind: 'DIALOGUE',
        sentences: [
          { position: 0, speaker: 'A' },
          { position: 1, speaker: 'B' },
        ],
      },
      {
        id: 'block-late',
        kind: 'QUESTION',
      },
    ]);
  });
});

function createDetail(): QuestionDetailResponse {
  const sentence = {
    sentenceVersionId: 'sentence',
    originalText: 'สวัสดี',
    translationKo: '안녕하세요',
    pronunciationKo: '싸왓디',
    toneMarks: '',
    audioUrl: null,
    tokens: [],
    expressions: [],
  };

  return {
    questionId: 'question',
    questionVersionId: 'version',
    questionType: { id: 'type', slug: 'dialogue', displayName: '대화' },
    skill: 'LISTENING',
    difficulty: 2,
    template: 'DIALOGUE_CHOICE',
    blocks: [
      {
        id: 'block-late',
        kind: 'QUESTION',
        displayMode: 'TEXT',
        position: 1,
        sentences: [{ position: 0, speaker: null, sentence }],
      },
      {
        id: 'block-early',
        kind: 'DIALOGUE',
        displayMode: 'TEXT_AND_AUDIO',
        position: 0,
        sentences: [
          { position: 1, speaker: 'B', sentence },
          { position: 0, speaker: 'A', sentence },
        ],
      },
    ],
    options: [],
    saved: false,
  };
}

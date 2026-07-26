/** 문제 풀이 페이지 컴포넌트 테스트용 공개 계약 fixture를 만든다 */
import type { QuestionDetailResponse } from '@flex-thia/contracts';

/** 표준 듣기 문제 fixture를 만든다 */
export function createQuestion(): QuestionDetailResponse {
  const sentence = {
    sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
    originalText: 'สวัสดีครับ',
    translationKo: '안녕하세요',
    pronunciationKo: '싸왓디 크랍',
    toneMarks: '',
    audioUrl: 'https://example.com/audio.mp3',
    tokens: [],
    expressions: [],
  };
  return {
    questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
    questionType: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
      slug: 'listening',
      displayName: '듣기 문제',
    },
    skill: 'LISTENING',
    difficulty: 2,
    template: 'STANDARD_CHOICE',
    blocks: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ad1',
        kind: 'QUESTION',
        displayMode: 'AUDIO_THEN_REVEAL',
        position: 0,
        sentences: [{ position: 0, speaker: null, sentence }],
      },
    ],
    options: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ae1',
        position: 0,
        sentence: { ...sentence, originalText: 'คำตอบ' },
        span: null,
      },
    ],
    saved: false,
  };
}

/** 화자 순서 정렬을 검증할 대화형 문제 fixture를 만든다 */
export function createDialogueQuestion(): QuestionDetailResponse {
  const detail = createQuestion();
  const firstBlock = getFirstQuestionBlock(detail);
  const firstSentence = getFirstSentence(detail);
  return {
    ...detail,
    template: 'DIALOGUE_CHOICE' as const,
    blocks: [
      {
        ...firstBlock,
        kind: 'DIALOGUE' as const,
        displayMode: 'TEXT_AND_AUDIO' as const,
        sentences: [
          { position: 1, speaker: 'B', sentence: firstSentence },
          {
            position: 0,
            speaker: 'A',
            sentence: {
              ...firstSentence,
              sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57af1',
            },
          },
        ],
      },
    ],
  };
}

/** 정답 제출 응답 fixture를 만든다 */
export function createFeedback() {
  return {
    attempt: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57af2',
      attemptNo: 1,
      isFirst: true,
      isCorrect: true,
      selectedOptionId: '01933b6a-8f13-7a19-b7e5-536d70f57ae1',
      submittedAt: '2026-07-26T00:00:00.000Z',
    },
    feedback: {
      correctOptionId: '01933b6a-8f13-7a19-b7e5-536d70f57ae1',
      explanationBlocks: [],
    },
  };
}

/** 상호작용 해설을 받을 문제 fixture를 만든다 */
export function createQuestionWithInteractiveExplanation(): QuestionDetailResponse {
  return createQuestion();
}

/** 태국어 토큰 피드백이 포함된 제출 응답 fixture를 만든다 */
export function createInteractiveFeedback(detail: QuestionDetailResponse) {
  const base = createFeedback();
  const sentence = getFirstSentence(detail);
  const explanationSentence = {
    ...sentence,
    sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57af3',
    originalText: 'เพราะ',
    translationKo: '왜냐하면',
    tokens: [
      {
        position: 0,
        surface: 'เพราะ',
        startOffset: 0,
        endOffset: 5,
        vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57af4',
        meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57af5',
        pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57af6',
        contextMeaningKo: '왜냐하면',
        pronunciationKo: '프러',
        toneMarks: 'H',
        audioUrl: null,
        role: 'TARGET' as const,
      },
    ],
  };

  return {
    ...base,
    feedback: {
      ...base.feedback,
      explanationBlocks: [
        {
          id: '01933b6a-8f13-7a19-b7e5-536d70f57af7',
          kind: 'EXPLANATION',
          displayMode: 'TEXT',
          position: 0,
          sentences: [
            { position: 0, speaker: null, sentence: explanationSentence },
          ],
        },
      ],
    },
  };
}

function getFirstQuestionBlock(detail: QuestionDetailResponse) {
  const block = detail.blocks.at(0);
  if (block === undefined) {
    throw new Error('첫 문제 block이 없습니다.');
  }
  return block;
}

function getFirstSentence(detail: QuestionDetailResponse) {
  const sentence = getFirstQuestionBlock(detail).sentences.at(0)?.sentence;
  if (sentence === undefined) {
    throw new Error('첫 문제 문장이 없습니다.');
  }
  return sentence;
}

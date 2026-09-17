import type { QuestionDetailResponse } from '@flex-thia/contracts/learning/questions';
export function createQuestion(): QuestionDetailResponse {
  return {
    questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    questionVersion: 1,
    questionType: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
      slug: 'reading',
      displayName: '읽기 문제',
    },
    skill: 'READING',
    difficulty: 2,
    passage: 'สวัสดีครับ',
    prompt: 'เลือกคำตอบ',
    options: [
      { id: '01933b6a-8f13-7a19-b7e5-536d70f57ab2', text: 'สวัสดี' },
      { id: '01933b6a-8f13-7a19-b7e5-536d70f57ab3', text: 'ขอบคุณ' },
    ],
    saved: false,
    firstResult: 'UNANSWERED',
  };
}

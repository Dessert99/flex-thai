/** canonical 문제 버전 JSON parser의 syntax·path·정확 입력을 검증한다 */
import { describe, expect, it } from 'vitest';
import { parseQuestionVersionPayload } from './parseQuestionVersionPayload';

describe('문제 버전 canonical JSON 해석', () => {
  it('JSON 구문 오류를 안전한 메시지로 반환한다', () => {
    expect(parseQuestionVersionPayload('{invalid')).toEqual({
      ok: false,
      message: 'JSON 구문을 확인해 주세요.',
    });
  });

  it('계약 오류의 field path를 반환한다', () => {
    expect(
      parseQuestionVersionPayload(
        JSON.stringify({ ...createValidPayload(), difficulty: 6 }),
      ),
    ).toMatchObject({
      ok: false,
      path: 'difficulty',
    });
  });

  it('정확한 canonical payload를 변경 없이 반환한다', () => {
    const payload = createValidPayload();
    expect(parseQuestionVersionPayload(JSON.stringify(payload))).toEqual({
      ok: true,
      payload: { ...payload, topicSlug: 'general', tagSlugs: [] },
    });
  });
});

function createValidPayload() {
  return {
    questionTypeSlug: 'dialogue-choice',
    questionTypeVersion: 1,
    difficulty: 4,
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        sentences: [
          {
            speaker: null,
            sentence: createSentence('문제 문장'),
          },
        ],
      },
    ],
    options: [
      {
        clientRef: 'option-1',
        position: 0,
        sentence: createSentence('정답 문장'),
        span: null,
      },
    ],
    correctOptionRef: 'option-1',
  };
}

function createSentence(translationKo: string) {
  return {
    originalText: 'สวัสดี',
    translationKo,
    pronunciationKo: '싸왓디',
    toneMarks: '',
    mediaAssetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    tokens: [],
    expressions: [],
  };
}

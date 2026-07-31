/** 해석된 관리자 문제를 canonical 교체 payload로 변환하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { toQuestionVersionPayload } from './toQuestionVersionPayload';

describe('문제 버전 구조화 payload 변환', () => {
  it('문장·보기·정답·해설과 토큰 참조를 보존한다', () => {
    const result = toQuestionVersionPayload(version() as never);

    expect(result).toMatchObject({
      ok: true,
      payload: {
        blocks: [{ kind: 'QUESTION' }, { kind: 'EXPLANATION' }],
        options: [{ clientRef: 'option-1' }],
        correctOptionRef: 'option-1',
      },
    });
  });

  it('media가 없는 문장도 null을 보존해 구조화 편집을 초기화한다', () => {
    const candidate = version();
    const block = candidate.blocks[0];
    const item = block?.sentences[0];
    if (!item) throw new Error('테스트 문장 fixture가 필요합니다.');
    item.sentence.mediaAssetId = null;

    const result = toQuestionVersionPayload(candidate as never);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('payload 변환 성공이 필요합니다.');
    expect(
      result.payload.blocks[0]?.sentences[0]?.sentence.mediaAssetId,
    ).toBeNull();
  });
});

function version() {
  const sentence = {
    id: 'sentence-1',
    originalText: 'สวัสดี',
    translationKo: '안녕하세요',
    pronunciationKo: '싸왓디',
    toneMarks: '',
    mediaAssetId: 'media-1' as string | null,
    tokens: [
      {
        position: 0,
        surface: 'สวัสดี',
        startOffset: 0,
        endOffset: 6,
        vocabularyId: 'vocabulary-1',
        meaningId: 'meaning-1',
        pronunciationId: 'pronunciation-1',
        contextMeaningKo: '안녕하세요',
        role: 'TARGET',
      },
    ],
    expressions: [],
  };
  return {
    questionType: { slug: 'reading-choice', version: 1 },
    difficulty: 2,
    topic: { slug: 'general' },
    tags: [{ slug: 'greeting' }],
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [{ speaker: null, sentence: { ...sentence } }],
      },
      {
        kind: 'EXPLANATION',
        displayMode: 'TEXT',
        sentences: [{ speaker: null, sentence: { ...sentence } }],
      },
    ],
    options: [
      {
        id: 'option-1',
        position: 0,
        sentenceVersionId: 'sentence-1',
        span: null,
        sentence: { ...sentence },
      },
    ],
    correctOptionId: 'option-1',
  };
}

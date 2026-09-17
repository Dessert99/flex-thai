/** 관리자 어휘 상세과 전체 교체 payload의 order·nullable·ref mapping을 검증한다 */
import type { AdminVocabularyDetailResponse } from '@flex-thia/contracts/admin/vocabularies';
import { describe, expect, it } from 'vitest';
import {
  mapVocabularyDetailToForm,
  mapVocabularyFormToRequest,
} from './mapVocabularyForm';

describe('관리자 어휘 form mapping', () => {
  it('응답 ID는 stable key와 request-local ref로만 사용한다', () => {
    const detail = createDetail();
    const form = mapVocabularyDetailToForm(detail);

    expect(form.meanings.map(({ clientRef }) => clientRef)).toEqual([
      detail.meanings[0]?.id,
      detail.meanings[1]?.id,
    ]);
    expect(form.meanings[0]?.difficulty).toBeNull();
    expect(form.meanings[0]?.contextNote).toBeNull();
    expect(mapVocabularyFormToRequest(form)).toEqual({
      thai: detail.thai,
      kind: detail.kind,
      meanings: form.meanings,
      pronunciations: form.pronunciations,
      meaningPronunciations: detail.meanings.map(({ id }) => ({
        meaningRef: id,
        pronunciationRef: `pronunciation:${id}`,
      })),
    });
    expect(form.pronunciations).toHaveLength(2);
    const firstPronunciation = form.pronunciations[0];
    if (!firstPronunciation) throw new Error('발음이 필요합니다.');
    firstPronunciation.pronunciationKo = '수정한 발음';
    expect(form.pronunciations[1]?.pronunciationKo).toBe('싸왓디');
    expect(mapVocabularyFormToRequest(form)).not.toHaveProperty('id');
  });
});

function createDetail(): AdminVocabularyDetailResponse {
  return {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    thai: 'สวัสดี',
    kind: 'WORD',
    status: 'DRAFT',
    importanceWeight: 5,
    mergedIntoVocabularyId: null,
    meanings: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        meaningKo: '안녕하세요',
        partOfSpeech: '감탄사',
        difficulty: null,
        contextNote: null,
      },
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        meaningKo: '반갑습니다',
        partOfSpeech: '감탄사',
        difficulty: 2,
        contextNote: '인사',
      },
    ],
    pronunciations: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
        pronunciationKo: '싸왓디',
        toneMarks: '',
      },
    ],
    meaningPronunciations: [
      {
        meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
      },
      {
        meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
      },
    ],
    relations: [],
    usage: {
      sentenceVersionIds: [],
      questionCount: 0,
      targetQuestionCount: 0,
      occurrenceCount: 0,
      questionIds: [],
    },
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  };
}

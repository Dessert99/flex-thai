/** 어휘 상세 component test가 공유하는 완전한 학습 정보 fixture를 만든다 */
import type { VocabularyDetailResponse } from '@flex-thia/contracts/learning/vocabularies';

const defaultVocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';

export function createDetail(
  id: string = defaultVocabularyId,
): VocabularyDetailResponse {
  return {
    id,
    thai: 'สวัสดี',
    kind: 'WORD',
    meanings: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        meaningKo: '안녕하세요',
        partOfSpeech: '감탄사',
        difficulty: 1,
        contextNote: null,
      },
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ac3',
        meaningKo: '인사',
        partOfSpeech: '명사',
        difficulty: null,
        contextNote: null,
      },
    ],
    relations: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ac0',
        type: 'SYNONYM',
        direction: 'BIDIRECTIONAL',
        meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        relatedVocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57ac1',
        relatedThai: 'หวัดดี',
        relatedMeaningId: '01933b6a-8f13-7a19-b7e5-536d70f57ac2',
        relatedMeaningKo: '안녕',
      },
    ],
    exampleSentences: [
      {
        sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab5',
        originalText: 'ฉันมา',
        translationKo: '나는 온다',
        tokens: [
          {
            position: 0,
            surface: 'ฉัน',
            startOffset: 0,
            endOffset: 3,
            vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57ab6',
            meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57ab7',
            contextMeaningKo: '나',
            role: 'TARGET',
          },
        ],
        expressions: [],
      },
    ],
    saved: false,
  };
}

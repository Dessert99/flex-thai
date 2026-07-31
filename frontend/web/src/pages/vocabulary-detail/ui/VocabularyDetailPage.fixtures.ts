/** 어휘 상세 component test가 공유하는 완전한 학습 정보 fixture를 만든다 */
import type {
  VocabularyDetailResponse,
  VocabularyRelatedQuestionsResponse,
} from '@flex-thia/contracts';

const defaultVocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';

/** 뜻별 발음 연결과 audio 누락을 함께 포함한 상세 fixture */
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
    pronunciations: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
        pronunciationKo: '싸왓디',
        toneMarks: 'L-L-M',
        audioUrl: 'https://example.com/hello.mp3',
      },
    ],
    audioEligibleMeaningCount: 1,
    meaningPronunciations: [
      {
        meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
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
        pronunciationKo: '찬 마',
        toneMarks: 'R M',
        audioUrl: 'https://example.com/sentence.mp3',
        tokens: [
          {
            position: 0,
            surface: 'ฉัน',
            startOffset: 0,
            endOffset: 3,
            vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57ab6',
            meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57ab7',
            pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57ab8',
            contextMeaningKo: '나',
            pronunciationKo: '찬',
            toneMarks: 'R',
            audioUrl: 'https://example.com/token.mp3',
            role: 'TARGET',
          },
        ],
        expressions: [],
      },
    ],
    saved: false,
  };
}

/** 상세의 현재 공개 관련 문제 fixture */
export function createRelatedQuestions(): VocabularyRelatedQuestionsResponse {
  return {
    items: [
      {
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
        questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab2',
        questionType: {
          id: '01933b6a-8f13-7a19-b7e5-536d70f57ab3',
          slug: 'greeting',
          displayName: '인사 표현',
        },
        skill: 'READING',
        difficulty: 1,
        saved: false,
        firstResult: 'UNANSWERED',
      },
    ],
    page: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  };
}

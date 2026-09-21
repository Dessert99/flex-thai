/** 학습자 내부 projection이 서명 URL과 strict 공개 계약으로 바뀌는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { LearnerContentService } from './learner-content.service.js';

const ids = {
  question: '00000000-0000-4000-8000-000000000001',
  version: '00000000-0000-4000-8000-000000000002',
  type: '00000000-0000-4000-8000-000000000003',
  block: '00000000-0000-4000-8000-000000000004',
  sentence: '00000000-0000-4000-8000-000000000005',
  option: '00000000-0000-4000-8000-000000000006',
  vocabulary: '00000000-0000-4000-8000-000000000007',
  meaning: '00000000-0000-4000-8000-000000000008',
  attempt: '00000000-0000-4000-8000-000000000010',
  clientAttempt: '00000000-0000-4000-8000-000000000011',
  requestedVersion: '00000000-0000-4000-8000-000000000012',
  persistedVersion: '00000000-0000-4000-8000-000000000013',
} as const;

const sentence = {
  sentenceVersionId: ids.sentence,
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  tokens: [
    {
      position: 0,
      surface: 'สวัสดี',
      startOffset: 0,
      endOffset: 6,
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      contextMeaningKo: '안녕하세요',
      role: 'TARGET',
    },
  ],
  expressions: [
    {
      startTokenIndex: 0,
      endTokenIndex: 1,
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      contextMeaningKo: '안녕하세요',
      representative: true,
    },
  ],
} as const;

const page = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
} as const;

const dependencies = () => ({
  vocabularyQuery: {
    listVocabularies: vi.fn().mockResolvedValue({
      items: [
        {
          id: ids.vocabulary,
          thai: 'สวัสดี',
          kind: 'WORD',
          meanings: [
            {
              id: ids.meaning,
              meaningKo: '안녕하세요',
              partOfSpeech: '감탄사',
              difficulty: 1,
              contextNote: null,
            },
          ],
          saved: true,
        },
      ],
      page,
    }),
    getVocabularyDetail: vi.fn().mockResolvedValue({
      id: ids.vocabulary,
      thai: 'สวัสดี',
      kind: 'WORD',
      meanings: [
        {
          id: ids.meaning,
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      saved: true,
      relations: [
        {
          id: '00000000-0000-4000-8000-000000000099',
          type: 'SYNONYM',
          direction: 'BIDIRECTIONAL',
          meaningId: ids.meaning,
          relatedVocabularyId: '00000000-0000-4000-8000-000000000098',
          relatedThai: 'หวัดดี',
          relatedMeaningId: '00000000-0000-4000-8000-000000000097',
          relatedMeaningKo: '안녕',
        },
      ],
      exampleSentences: [
        {
          sentenceVersionId: ids.sentence,
          originalText: 'เขาพูดว่าสวัสดี',
          translationKo: '그는 안녕하세요라고 말했다',
          tokens: sentence.tokens,
          expressions: sentence.expressions,
        },
      ],
    }),
  },
});

describe('LearnerContentService 어휘 응답', () => {
  it('어휘 상세 query의 null도 같은 stable 404 code로 바꾼다', async () => {
    const fakes = dependencies();
    fakes.vocabularyQuery.getVocabularyDetail.mockResolvedValueOnce(null);
    const service = new LearnerContentService({ ...fakes });

    await expect(
      service.getVocabularyDetail('user-1', ids.vocabulary),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'VOCABULARY_NOT_FOUND' },
    });
  });
});

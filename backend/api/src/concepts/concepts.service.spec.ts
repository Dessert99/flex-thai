/** 개념 API 응답의 media 서명과 strict 계약을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { ConceptsService } from './concepts.service.js';

describe('ConceptsService', () => {
  it('학습자 상세의 문장 음성을 서명하고 storage key를 제거한다', async () => {
    const learnerQuery = {
      list: vi.fn(),
      findPublishedDetail: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        versionId: '22222222-2222-4222-8222-222222222222',
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '요약',
        tableOfContents: [
          {
            blockId: '33333333-3333-4333-8333-333333333333',
            heading: '예문',
            position: 0,
          },
        ],
        blocks: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            kind: 'THAI_EXAMPLES',
            position: 0,
            heading: '예문',
            examples: [
              {
                position: 0,
                noteKo: null,
                sentence: {
                  sentenceVersionId:
                    '44444444-4444-4444-8444-444444444444',
                  originalText: 'ฉันเรียนภาษาไทย',
                  translationKo: '나는 태국어를 공부한다',
                  pronunciationKo: '찬 리안 파싸 타이',
                  toneMarks: '',
                  media: { storageKey: 'sentence.mp3' },
                  tokens: [{
                    position: 0,
                    surface: 'ฉัน',
                    startOffset: 0,
                    endOffset: 3,
                    vocabularyId: '55555555-5555-4555-8555-555555555555',
                    meaningId: '66666666-6666-4666-8666-666666666666',
                    pronunciationId: '77777777-7777-4777-8777-777777777777',
                    contextMeaningKo: '나',
                    pronunciationKo: '찬',
                    toneMarks: '',
                    media: { storageKey: 'token.mp3' },
                    role: 'TARGET',
                  }],
                  expressions: [{
                    startTokenIndex: 0,
                    endTokenIndex: 1,
                    vocabularyId: '88888888-8888-4888-8888-888888888888',
                    meaningId: '99999999-9999-4999-8999-999999999999',
                    pronunciationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    contextMeaningKo: '나',
                    pronunciationKo: '찬',
                    toneMarks: '',
                    media: { storageKey: 'expression.mp3' },
                    representative: true,
                  }],
                },
              },
            ],
          },
        ],
      }),
    };
    const mediaReadUrls = {
      createReadUrl: vi
        .fn()
        .mockResolvedValue('https://media.example/sentence'),
    };
    const service = new ConceptsService({
      learnerQuery,
      adminQuery: {} as never,
      adminService: {} as never,
      mediaReadUrls,
    });

    const detail = await service.getPublishedDetail(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(detail.blocks[0]).not.toHaveProperty('media');
    expect(JSON.stringify(detail)).not.toContain('storageKey');
    expect(JSON.stringify(detail)).toContain(
      'https://media.example/sentence',
    );
    expect(
      learnerQuery.findPublishedDetail.mock.results[0]?.value,
    ).toBeDefined();
    expect(mediaReadUrls.createReadUrl).toHaveBeenCalledTimes(3);
  });

  it('없는 게시 개념을 같은 404로 숨긴다', async () => {
    const service = new ConceptsService({
      learnerQuery: {
        list: vi.fn(),
        findPublishedDetail: vi.fn().mockResolvedValue(null),
      },
      adminQuery: {} as never,
      adminService: {} as never,
      mediaReadUrls: {} as never,
    });

    await expect(
      service.getPublishedDetail('11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

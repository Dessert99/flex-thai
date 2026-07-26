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
                  tokens: [],
                  expressions: [],
                },
              },
            ],
          },
        ],
      }),
    };
    const service = new ConceptsService({
      learnerQuery,
      adminQuery: {} as never,
      adminService: {} as never,
      mediaReadUrls: {
        createReadUrl: vi
          .fn()
          .mockResolvedValue('https://media.example/sentence'),
      },
    });

    const detail = await service.getPublishedDetail(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(detail.blocks[0]).not.toHaveProperty('media');
    expect(JSON.stringify(detail)).not.toContain('storageKey');
    expect(JSON.stringify(detail)).toContain(
      'https://media.example/sentence',
    );
  });
});

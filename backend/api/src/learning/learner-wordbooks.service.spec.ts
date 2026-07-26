/** 단어장 projection의 ISO·media URL 공개 응답과 use case 위임을 검증한다 */
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  LearnerWordbooksPublicResponseError,
  LearnerWordbooksService,
} from './learner-wordbooks.service.js';

const ids = {
  wordbook: '00000000-0000-4000-8000-000000000101',
  target: '00000000-0000-4000-8000-000000000102',
  vocabulary: '00000000-0000-4000-8000-000000000103',
  meaning: '00000000-0000-4000-8000-000000000104',
  pronunciation: '00000000-0000-4000-8000-000000000105',
} as const;
const now = new Date('2026-07-26T00:00:00.000Z');
const wordbook = {
  id: ids.wordbook,
  name: 'FLEX 어휘',
  itemCount: 1,
  createdAt: now,
  updatedAt: now,
};

const dependencies = () => ({
  query: {
    listWordbooks: vi.fn().mockResolvedValue([wordbook]),
    listItems: vi.fn().mockResolvedValue({
      wordbook,
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
          pronunciations: [
            {
              id: ids.pronunciation,
              pronunciationKo: '싸왓디',
              toneMarks: 'L-L-M',
              media: { storageKey: 'private/shared.mp3' },
            },
            {
              id: '00000000-0000-4000-8000-000000000106',
              pronunciationKo: '사왓디',
              toneMarks: 'L-L-M',
              media: { storageKey: 'private/shared.mp3' },
            },
          ],
          audioEligibleMeaningCount: 1,
          saved: true,
          addedAt: now,
        },
      ],
      page: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    }),
    listMemberships: vi.fn().mockResolvedValue([ids.wordbook]),
  },
  wordbooks: {
    create: vi.fn().mockResolvedValue({
      ...wordbook,
      userId: 'user-id',
    }),
    rename: vi.fn().mockResolvedValue({
      ...wordbook,
      userId: 'user-id',
      name: '듣기',
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    addVocabulary: vi.fn().mockResolvedValue(undefined),
    removeVocabulary: vi.fn().mockResolvedValue(undefined),
    copyVocabularies: vi.fn().mockResolvedValue(undefined),
    moveVocabularies: vi.fn().mockResolvedValue(undefined),
    removeVocabularies: vi.fn().mockResolvedValue(undefined),
  },
  mediaReadUrls: {
    createReadUrl: vi
      .fn()
      .mockResolvedValue('https://media.example.com/shared.mp3'),
  },
  now: () => now,
});

describe('LearnerWordbooksService 공개 응답', () => {
  it('Date를 ISO로 바꾸고 같은 storage key는 응답에서 한 번만 서명한다', async () => {
    const fake = dependencies();
    const service = new LearnerWordbooksService(fake);

    const result = await service.listItems('user-id', ids.wordbook, {
      page: 1,
      pageSize: 20,
    });

    expect(result.wordbook.createdAt).toBe(now.toISOString());
    expect(result.items[0]?.addedAt).toBe(now.toISOString());
    expect(result.items[0]?.audioEligibleMeaningCount).toBe(1);
    expect(result.items[0]?.pronunciations).toEqual([
      expect.objectContaining({
        audioUrl: 'https://media.example.com/shared.mp3',
      }),
      expect.objectContaining({
        audioUrl: 'https://media.example.com/shared.mp3',
      }),
    ]);
    expect(fake.mediaReadUrls.createReadUrl).toHaveBeenCalledTimes(1);
    expect(fake.mediaReadUrls.createReadUrl).toHaveBeenCalledWith(
      'private/shared.mp3',
      new Date('2026-07-26T00:05:00.000Z'),
    );
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });

  it('query null은 단어장 존재를 숨기는 404로 바꾼다', async () => {
    const fake = dependencies();
    fake.query.listItems.mockResolvedValueOnce(null);
    const service = new LearnerWordbooksService(fake);

    await expect(
      service.listItems('user-id', ids.wordbook, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toEqual(new NotFoundException({ code: 'WORDBOOK_NOT_FOUND' }));
  });

  it('private 필드가 섞인 목록은 generic 공개 응답 오류로 제한한다', async () => {
    const fake = dependencies();
    fake.query.listWordbooks.mockResolvedValueOnce([
      { ...wordbook, storageKey: 'private/leak' },
    ]);
    const service = new LearnerWordbooksService(fake);

    await expect(service.listWordbooks('user-id')).rejects.toBeInstanceOf(
      LearnerWordbooksPublicResponseError,
    );
  });
});

describe('LearnerWordbooksService 쓰기 위임', () => {
  it('생성·변경 뒤 사용자 소유 projection을 공개 응답으로 반환한다', async () => {
    const fake = dependencies();
    fake.query.listWordbooks
      .mockResolvedValueOnce([{ ...wordbook, itemCount: 0 }])
      .mockResolvedValueOnce([{ ...wordbook, name: '듣기' }]);
    const service = new LearnerWordbooksService(fake);

    await expect(
      service.create('user-id', { name: 'FLEX 어휘' }),
    ).resolves.toMatchObject({ itemCount: 0 });
    await expect(
      service.rename('user-id', ids.wordbook, { name: '듣기' }),
    ).resolves.toMatchObject({ name: '듣기', itemCount: 1 });

    expect(fake.wordbooks.create).toHaveBeenCalledWith('user-id', 'FLEX 어휘');
    expect(fake.wordbooks.rename).toHaveBeenCalledWith(
      'user-id',
      ids.wordbook,
      '듣기',
    );
  });

  it('bulk 요청과 membership 조회를 현재 사용자 ID 그대로 위임한다', async () => {
    const fake = dependencies();
    const service = new LearnerWordbooksService(fake);

    await service.copyVocabularies('user-id', ids.wordbook, {
      targetWordbookId: ids.target,
      vocabularyIds: [ids.vocabulary],
    });
    await service.moveVocabularies('user-id', ids.wordbook, {
      targetWordbookId: ids.target,
      vocabularyIds: [ids.vocabulary],
    });
    await service.removeVocabularies('user-id', ids.wordbook, {
      vocabularyIds: [ids.vocabulary],
    });
    await expect(
      service.listMemberships('user-id', ids.vocabulary),
    ).resolves.toEqual({ wordbookIds: [ids.wordbook] });

    expect(fake.wordbooks.copyVocabularies).toHaveBeenCalledWith(
      'user-id',
      ids.wordbook,
      ids.target,
      [ids.vocabulary],
    );
    expect(fake.wordbooks.moveVocabularies).toHaveBeenCalledWith(
      'user-id',
      ids.wordbook,
      ids.target,
      [ids.vocabulary],
    );
    expect(fake.wordbooks.removeVocabularies).toHaveBeenCalledWith(
      'user-id',
      ids.wordbook,
      [ids.vocabulary],
    );
  });
});

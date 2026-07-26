/** 단어장 이름·소유권 오류와 bulk 위임 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  WordbookRecord,
  WordbookRemoveInput,
  WordbookRepository,
  WordbookTransferInput,
} from './wordbook.repository.js';
import { WordbookService } from './wordbook.js';

const ids = {
  user: '00000000-0000-4000-8000-000000000201',
  wordbook: '00000000-0000-4000-8000-000000000202',
  target: '00000000-0000-4000-8000-000000000203',
  vocabulary: '00000000-0000-4000-8000-000000000204',
  secondVocabulary: '00000000-0000-4000-8000-000000000205',
} as const;
const now = new Date('2026-07-26T02:00:00.000Z');

class FakeWordbookRepository implements WordbookRepository {
  createResult: WordbookRecord = {
    id: ids.wordbook,
    userId: ids.user,
    name: 'FLEX 어휘',
    createdAt: now,
    updatedAt: now,
  };
  renameResult: WordbookRecord | null = this.createResult;
  deleteResult = true;
  addResult:
    | 'ADDED'
    | 'ALREADY_EXISTS'
    | 'WORDBOOK_NOT_FOUND'
    | 'VOCABULARY_UNAVAILABLE' = 'ADDED';
  removeResult = true;
  copyResult = true;
  moveResult = true;
  removeManyResult = true;
  createInputs: Array<{ userId: string; name: string; now: Date }> = [];
  renameInputs: Array<{
    userId: string;
    wordbookId: string;
    name: string;
    now: Date;
  }> = [];
  transferInputs: WordbookTransferInput[] = [];
  removeInputs: WordbookRemoveInput[] = [];

  create(userId: string, name: string, createdAt: Date) {
    this.createInputs.push({ userId, name, now: createdAt });
    return Promise.resolve({ ...this.createResult, name });
  }

  rename(
    userId: string,
    wordbookId: string,
    name: string,
    updatedAt: Date,
  ) {
    this.renameInputs.push({ userId, wordbookId, name, now: updatedAt });
    return Promise.resolve(
      this.renameResult === null ? null : { ...this.renameResult, name },
    );
  }

  delete() {
    return Promise.resolve(this.deleteResult);
  }

  addVocabulary() {
    return Promise.resolve(this.addResult);
  }

  removeVocabulary() {
    return Promise.resolve(this.removeResult);
  }

  copyVocabularies(input: WordbookTransferInput) {
    this.transferInputs.push(input);
    return Promise.resolve(this.copyResult);
  }

  moveVocabularies(input: WordbookTransferInput) {
    this.transferInputs.push(input);
    return Promise.resolve(this.moveResult);
  }

  removeVocabularies(input: WordbookRemoveInput) {
    this.removeInputs.push(input);
    return Promise.resolve(this.removeManyResult);
  }
}

describe('WordbookService 단어장 이름', () => {
  it('trim한 이름과 고정 시각으로 단어장을 생성·변경한다', async () => {
    const repository = new FakeWordbookRepository();
    const service = new WordbookService(repository, () => now);

    await service.create(ids.user, '  FLEX 어휘  ');
    await service.rename(ids.user, ids.wordbook, '  듣기 어휘  ');

    expect(repository.createInputs).toEqual([
      { userId: ids.user, name: 'FLEX 어휘', now },
    ]);
    expect(repository.renameInputs).toEqual([
      {
        userId: ids.user,
        wordbookId: ids.wordbook,
        name: '듣기 어휘',
        now,
      },
    ]);
  });

  it('공백과 51자 이름은 repository 호출 전에 거부한다', async () => {
    const repository = new FakeWordbookRepository();
    const service = new WordbookService(repository);

    await expect(service.create(ids.user, '   ')).rejects.toMatchObject({
      code: 'WORDBOOK_NAME_INVALID',
    });
    await expect(
      service.create(ids.user, '가'.repeat(51)),
    ).rejects.toMatchObject({ code: 'WORDBOOK_NAME_INVALID' });
    expect(repository.createInputs).toEqual([]);
  });

  it('타 사용자와 없는 단어장을 같은 not found 오류로 숨긴다', async () => {
    const repository = new FakeWordbookRepository();
    repository.renameResult = null;
    repository.deleteResult = false;
    const service = new WordbookService(repository);

    await expect(
      service.rename(ids.user, ids.wordbook, '이름'),
    ).rejects.toMatchObject({ code: 'WORDBOOK_NOT_FOUND' });
    await expect(
      service.delete(ids.user, ids.wordbook),
    ).rejects.toMatchObject({ code: 'WORDBOOK_NOT_FOUND' });
  });
});

describe('WordbookService 항목 변경', () => {
  it('source와 target이 같으면 bulk repository를 호출하지 않는다', async () => {
    const repository = new FakeWordbookRepository();
    const service = new WordbookService(repository);

    await expect(
      service.moveVocabularies(
        ids.user,
        ids.wordbook,
        ids.wordbook,
        [ids.vocabulary],
      ),
    ).rejects.toMatchObject({ code: 'WORDBOOK_SAME_TARGET' });
    expect(repository.transferInputs).toEqual([]);
  });

  it('복사·이동에 사용자와 선택 UUID와 고정 시각을 그대로 전달한다', async () => {
    const repository = new FakeWordbookRepository();
    const service = new WordbookService(repository, () => now);
    const vocabularyIds = [ids.vocabulary, ids.secondVocabulary];

    await service.copyVocabularies(
      ids.user,
      ids.wordbook,
      ids.target,
      vocabularyIds,
    );
    await service.moveVocabularies(
      ids.user,
      ids.wordbook,
      ids.target,
      vocabularyIds,
    );
    await service.removeVocabularies(ids.user, ids.wordbook, vocabularyIds);

    expect(repository.transferInputs).toEqual([
      {
        userId: ids.user,
        sourceWordbookId: ids.wordbook,
        targetWordbookId: ids.target,
        vocabularyIds,
        transferredAt: now,
      },
      {
        userId: ids.user,
        sourceWordbookId: ids.wordbook,
        targetWordbookId: ids.target,
        vocabularyIds,
        transferredAt: now,
      },
    ]);
    expect(repository.removeInputs).toEqual([
      {
        userId: ids.user,
        wordbookId: ids.wordbook,
        vocabularyIds,
      },
    ]);
  });

  it('없는 단어장과 비공개 어휘 결과를 안정적인 domain 오류로 바꾼다', async () => {
    const repository = new FakeWordbookRepository();
    const service = new WordbookService(repository);
    repository.addResult = 'VOCABULARY_UNAVAILABLE';

    await expect(
      service.addVocabulary(ids.user, ids.wordbook, ids.vocabulary),
    ).rejects.toMatchObject({ code: 'VOCABULARY_UNAVAILABLE' });

    repository.addResult = 'WORDBOOK_NOT_FOUND';
    repository.removeResult = false;
    repository.copyResult = false;
    await expect(
      service.addVocabulary(ids.user, ids.wordbook, ids.vocabulary),
    ).rejects.toMatchObject({ code: 'WORDBOOK_NOT_FOUND' });
    await expect(
      service.removeVocabulary(ids.user, ids.wordbook, ids.vocabulary),
    ).rejects.toMatchObject({ code: 'WORDBOOK_NOT_FOUND' });
    await expect(
      service.copyVocabularies(
        ids.user,
        ids.wordbook,
        ids.target,
        [ids.vocabulary],
      ),
    ).rejects.toMatchObject({ code: 'WORDBOOK_NOT_FOUND' });
  });
});

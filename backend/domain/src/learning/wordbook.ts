/** 단어장 이름과 사용자 소유 항목 변경 use case를 제공한다 */
import type {
  WordbookRecord,
  WordbookRepository,
} from './wordbook.repository.js';

type WordbookDomainErrorCode =
  | 'WORDBOOK_NAME_INVALID'
  | 'WORDBOOK_NOT_FOUND'
  | 'WORDBOOK_SAME_TARGET'
  | 'VOCABULARY_UNAVAILABLE';

/** 전달 계층이 안정적으로 변환할 단어장 업무 오류 */
export class WordbookDomainError extends Error {
  constructor(readonly code: WordbookDomainErrorCode) {
    super(code);
    this.name = 'WordbookDomainError';
  }
}

/** 단어장 한 개와 그 항목 변경을 repository transaction에 위임한다 */
export class WordbookService {
  constructor(
    private readonly repository: WordbookRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 정규화한 이름으로 사용자 단어장을 만든다 */
  async create(userId: string, name: string): Promise<WordbookRecord> {
    return this.repository.create(userId, normalizeName(name), this.now());
  }

  /** 소유 단어장만 정규화한 이름으로 변경한다 */
  async rename(
    userId: string,
    wordbookId: string,
    name: string,
  ): Promise<WordbookRecord> {
    const renamed = await this.repository.rename(
      userId,
      wordbookId,
      normalizeName(name),
      this.now(),
    );
    if (!renamed) throw new WordbookDomainError('WORDBOOK_NOT_FOUND');
    return renamed;
  }

  /** 소유 단어장만 항목과 함께 삭제한다 */
  async delete(userId: string, wordbookId: string): Promise<void> {
    if (!(await this.repository.delete(userId, wordbookId))) {
      throw new WordbookDomainError('WORDBOOK_NOT_FOUND');
    }
  }

  /** 현재 게시 어휘만 소유 단어장에 멱등 추가한다 */
  async addVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
  ): Promise<void> {
    const result = await this.repository.addVocabulary(
      userId,
      wordbookId,
      vocabularyId,
      this.now(),
    );
    if (result === 'WORDBOOK_NOT_FOUND') {
      throw new WordbookDomainError('WORDBOOK_NOT_FOUND');
    }
    if (result === 'VOCABULARY_UNAVAILABLE') {
      throw new WordbookDomainError('VOCABULARY_UNAVAILABLE');
    }
  }

  /** 어휘 공개 상태와 무관하게 소유 단어장의 연결을 멱등 제거한다 */
  async removeVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
  ): Promise<void> {
    if (
      !(await this.repository.removeVocabulary(
        userId,
        wordbookId,
        vocabularyId,
      ))
    ) {
      throw new WordbookDomainError('WORDBOOK_NOT_FOUND');
    }
  }

  /** 선택 membership을 대상 단어장에 멱등 복사한다 */
  async copyVocabularies(
    userId: string,
    sourceWordbookId: string,
    targetWordbookId: string,
    vocabularyIds: string[],
  ): Promise<void> {
    assertDifferentWordbooks(sourceWordbookId, targetWordbookId);
    const copied = await this.repository.copyVocabularies({
      userId,
      sourceWordbookId,
      targetWordbookId,
      vocabularyIds,
      transferredAt: this.now(),
    });
    if (!copied) throw new WordbookDomainError('WORDBOOK_NOT_FOUND');
  }

  /** 선택 membership 복사와 source 제거를 한 transaction으로 요청한다 */
  async moveVocabularies(
    userId: string,
    sourceWordbookId: string,
    targetWordbookId: string,
    vocabularyIds: string[],
  ): Promise<void> {
    assertDifferentWordbooks(sourceWordbookId, targetWordbookId);
    const moved = await this.repository.moveVocabularies({
      userId,
      sourceWordbookId,
      targetWordbookId,
      vocabularyIds,
      transferredAt: this.now(),
    });
    if (!moved) throw new WordbookDomainError('WORDBOOK_NOT_FOUND');
  }

  /** 선택 membership을 소유 단어장에서 한 번에 제거한다 */
  async removeVocabularies(
    userId: string,
    wordbookId: string,
    vocabularyIds: string[],
  ): Promise<void> {
    const removed = await this.repository.removeVocabularies({
      userId,
      wordbookId,
      vocabularyIds,
    });
    if (!removed) throw new WordbookDomainError('WORDBOOK_NOT_FOUND');
  }
}

const normalizeName = (name: string): string => {
  const normalized = name.trim();
  if (normalized.length === 0 || normalized.length > 50) {
    throw new WordbookDomainError('WORDBOOK_NAME_INVALID');
  }
  return normalized;
};

const assertDifferentWordbooks = (
  sourceWordbookId: string,
  targetWordbookId: string,
): void => {
  if (sourceWordbookId === targetWordbookId) {
    throw new WordbookDomainError('WORDBOOK_SAME_TARGET');
  }
};

/** 단어장 쓰기와 원자적 항목 이동에 필요한 저장 port를 정의한다 */

/** 사용자 소유 단어장 record */
export interface WordbookRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 두 단어장 사이 선택 항목 복사·이동 transaction 입력 */
export interface WordbookTransferInput {
  userId: string;
  sourceWordbookId: string;
  targetWordbookId: string;
  vocabularyIds: string[];
  transferredAt: Date;
}

/** 한 단어장에서 선택 항목을 제거하는 transaction 입력 */
export interface WordbookRemoveInput {
  userId: string;
  wordbookId: string;
  vocabularyIds: string[];
}

/** 단어장 소유권과 bulk 원자성을 구현할 repository port */
export interface WordbookRepository {
  create(userId: string, name: string, now: Date): Promise<WordbookRecord>;
  rename(
    userId: string,
    wordbookId: string,
    name: string,
    now: Date,
  ): Promise<WordbookRecord | null>;
  delete(userId: string, wordbookId: string): Promise<boolean>;
  addVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
    addedAt: Date,
  ): Promise<
    'ADDED' | 'ALREADY_EXISTS' | 'WORDBOOK_NOT_FOUND' | 'VOCABULARY_UNAVAILABLE'
  >;
  removeVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
  ): Promise<boolean>;
  copyVocabularies(input: WordbookTransferInput): Promise<boolean>;
  moveVocabularies(input: WordbookTransferInput): Promise<boolean>;
  removeVocabularies(input: WordbookRemoveInput): Promise<boolean>;
}

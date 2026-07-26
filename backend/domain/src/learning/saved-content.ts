/** 공개 문제만 저장하고 삭제는 대상 상태와 무관하게 멱등 처리한다 */
import { LearningDomainError } from './question-attempt.js';
import type { SavedContentRepository } from './saved-content.repository.js';

/** 문제 저장 연결을 멱등하게 관리한다 */
export class SavedContentService {
  constructor(private readonly repository: SavedContentRepository) {}

  /** 현재 공개 문제만 사용자 저장 목록에 연결한다 */
  async saveQuestion(
    userId: string,
    questionId: string,
    savedAt: Date,
  ): Promise<void> {
    if (!(await this.repository.isQuestionAvailable(questionId))) {
      throw new LearningDomainError('QUESTION_UNAVAILABLE');
    }
    await this.repository.saveQuestion(userId, questionId, savedAt);
  }

  /** 문제의 이후 노출 상태를 조회하지 않고 저장 연결을 제거한다 */
  removeQuestion(userId: string, questionId: string): Promise<void> {
    return this.repository.removeQuestion(userId, questionId);
  }

  /** 통합 전 기존 저장 어휘 endpoint의 멱등 저장을 유지한다 */
  async saveVocabulary(
    userId: string,
    vocabularyId: string,
    savedAt: Date,
  ): Promise<void> {
    if (!(await this.repository.isVocabularyAvailable(vocabularyId))) {
      throw new LearningDomainError('VOCABULARY_UNAVAILABLE');
    }
    await this.repository.saveVocabulary(userId, vocabularyId, savedAt);
  }

  /** 통합 전 기존 저장 어휘 endpoint의 멱등 제거를 유지한다 */
  removeVocabulary(userId: string, vocabularyId: string): Promise<void> {
    return this.repository.removeVocabulary(userId, vocabularyId);
  }
}

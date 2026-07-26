/** 저장 문제의 가용성 확인과 멱등 연결 변경 port를 정의한다 */

/** 저장 대상의 현재 공개 상태를 확인하고 사용자 연결만 변경한다 */
export interface SavedContentRepository {
  isQuestionAvailable(questionId: string): Promise<boolean>;
  isVocabularyAvailable(vocabularyId: string): Promise<boolean>;
  saveQuestion(
    userId: string,
    questionId: string,
    savedAt: Date,
  ): Promise<void>;
  removeQuestion(userId: string, questionId: string): Promise<void>;
  saveVocabulary(
    userId: string,
    vocabularyId: string,
    savedAt: Date,
  ): Promise<void>;
  removeVocabulary(userId: string, vocabularyId: string): Promise<void>;
}

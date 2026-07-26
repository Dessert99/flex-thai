/** 문제 저장 연결의 가용성과 멱등 호출을 검증한다 */
import { describe, expect, it } from 'vitest';
import type { SavedContentRepository } from './saved-content.repository.js';
import { SavedContentService } from './saved-content.js';

const userId = 'user-1';
const savedAt = new Date('2026-07-24T00:00:00.000Z');

class FakeSavedContentRepository implements SavedContentRepository {
  readonly savedQuestions = new Set<string>();
  readonly savedVocabularies = new Set<string>();
  readonly savedQuestionDates: Date[] = [];
  questionAvailable = true;
  vocabularyAvailable = true;
  questionAvailabilityChecks = 0;

  isQuestionAvailable(): Promise<boolean> {
    this.questionAvailabilityChecks += 1;
    return Promise.resolve(this.questionAvailable);
  }

  isVocabularyAvailable(): Promise<boolean> {
    return Promise.resolve(this.vocabularyAvailable);
  }

  saveQuestion(
    userIdInput: string,
    questionId: string,
    savedAtInput: Date,
  ): Promise<void> {
    this.savedQuestions.add(`${userIdInput}:${questionId}`);
    this.savedQuestionDates.push(savedAtInput);
    return Promise.resolve();
  }

  removeQuestion(userIdInput: string, questionId: string): Promise<void> {
    this.savedQuestions.delete(`${userIdInput}:${questionId}`);
    return Promise.resolve();
  }

  saveVocabulary(userIdInput: string, vocabularyId: string): Promise<void> {
    this.savedVocabularies.add(`${userIdInput}:${vocabularyId}`);
    return Promise.resolve();
  }

  removeVocabulary(userIdInput: string, vocabularyId: string): Promise<void> {
    this.savedVocabularies.delete(`${userIdInput}:${vocabularyId}`);
    return Promise.resolve();
  }
}

describe('SavedContentService 저장 콘텐츠', () => {
  it('공개 문제를 중복 없이 저장한다', async () => {
    const repository = new FakeSavedContentRepository();
    const service = new SavedContentService(repository);

    await service.saveQuestion(userId, 'question-1', savedAt);
    await service.saveQuestion(userId, 'question-1', savedAt);

    expect([...repository.savedQuestions]).toEqual(['user-1:question-1']);
    expect(repository.savedQuestionDates).toEqual([savedAt, savedAt]);
  });

  it('숨긴 문제는 저장하지 않는다', async () => {
    const repository = new FakeSavedContentRepository();
    repository.questionAvailable = false;
    const service = new SavedContentService(repository);

    await expect(
      service.saveQuestion(userId, 'question-1', savedAt),
    ).rejects.toMatchObject({ code: 'QUESTION_UNAVAILABLE' });
    expect(repository.savedQuestions).toHaveLength(0);
  });

  it('삭제는 대상이 숨겨진 뒤에도 반복 성공한다', async () => {
    const repository = new FakeSavedContentRepository();
    const service = new SavedContentService(repository);
    await service.saveQuestion(userId, 'question-1', savedAt);
    repository.questionAvailable = false;
    repository.questionAvailabilityChecks = 0;

    await service.removeQuestion(userId, 'question-1');
    await service.removeQuestion(userId, 'question-1');

    expect(repository.savedQuestions).toHaveLength(0);
    expect(repository.questionAvailabilityChecks).toBe(0);
  });
});

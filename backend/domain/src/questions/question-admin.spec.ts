import { describe, expect, it, vi } from 'vitest';
import { QuestionAdminService } from './question-admin.js';
import type {
  QuestionAdminRecord,
  QuestionAdminTransaction,
} from './question-admin.repository.js';
import { questionLearningStatus } from './question.js';
const now = new Date('2026-09-17T00:00:00Z');
const actor = {
  actorSub: 'sub',
  actorUserId: 'user',
  requestId: 'request',
  occurredAt: new Date(now.getTime() + 1000),
};
const fixture = () => {
  const record: QuestionAdminRecord = {
    id: 'question',
    version: 1,
    status: 'PUBLISHED',
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    typeVersionId: 'type',
    topicId: 'topic',
    tagIds: [],
    difficulty: 2,
    passage: null,
    prompt: '질문',
    options: [
      { id: 'a', text: '가' },
      { id: 'b', text: '나' },
    ],
    correctOptionId: 'a',
    explanation: '해설',
    vocabularies: [],
  };
  const tx = {
    loadQuestion: () => Promise.resolve(record),
    validateReferences: () => Promise.resolve(true),
    saveQuestion: vi.fn(),
    appendAuditLog: vi.fn(),
  } satisfies QuestionAdminTransaction;
  const service = new QuestionAdminService({
    runInTransaction: async (work) => work(tx),
  });
  const command = {
    ...actor,
    questionId: record.id,
    input: { ...record },
    expectedVersion: 1,
    expectedUpdatedAt: now,
    requiresRetry: false,
  };
  return { record, tx, service, command };
};
describe('현재 문제 편집', () => {
  it('오탈자 수정은 버전을 유지하고 수정 시각을 남긴다', async () => {
    const f = fixture();
    f.command.input.prompt = '고친 질문';
    const result = await f.service.update(f.command);
    expect(result.version).toBe(1);
    expect(result.updatedAt).toEqual(actor.occurredAt);
    expect(f.tx.appendAuditLog).toHaveBeenCalled();
  });
  it('재풀이 지정 또는 정답 변경은 버전을 올린다', async () => {
    const f = fixture();
    expect(
      (await f.service.update({ ...f.command, requiresRetry: true })).version,
    ).toBe(2);
    expect(
      (
        await f.service.update({
          ...f.command,
          input: { ...f.command.input, correctOptionId: 'b' },
        })
      ).version,
    ).toBe(2);
  });
  it('오탈자 수정 사이에도 오래된 화면에서 덮어쓰지 못한다', async () => {
    const f = fixture();
    await expect(
      f.service.update({ ...f.command, expectedUpdatedAt: new Date(0) }),
    ).rejects.toMatchObject({ code: 'QUESTION_VERSION_CONFLICT' });
    expect(f.tx.saveQuestion).not.toHaveBeenCalled();
  });
  it('없는 뜻·어휘를 연결하거나 중복 사용 행을 저장할 수 없다', async () => {
    const f = fixture();
    f.tx.validateReferences = () => Promise.resolve(false);
    await expect(f.service.update(f.command)).rejects.toMatchObject({
      code: 'QUESTION_REFERENCE_MISMATCH',
    });
  });
  it('현재 버전과 마지막 풀이로 수정됨 상태를 구분한다', () => {
    expect(
      questionLearningStatus(2, { questionVersion: 1, isCorrect: true }),
    ).toBe('UPDATED');
    expect(
      questionLearningStatus(2, { questionVersion: 2, isCorrect: false }),
    ).toBe('INCORRECT');
    expect(questionLearningStatus(2, null)).toBe('UNANSWERED');
  });
});

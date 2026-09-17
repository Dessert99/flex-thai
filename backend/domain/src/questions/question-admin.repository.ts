/** 현재 문제와 어휘 연결을 한 트랜잭션에서 교체한다. */
import type { QuestionContent, QuestionVocabulary } from './question.js';
export interface QuestionAdminInput extends QuestionContent {
  typeVersionId: string;
  topicId: string;
  tagIds: string[];
  difficulty: number;
  vocabularies: QuestionVocabulary[];
}
export interface QuestionAdminRecord extends QuestionAdminInput {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}
export interface QuestionAdminAuditInput {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  occurredAt: Date;
  action: string;
  targetId: string;
  summary: Record<string, unknown>;
}
export interface QuestionAdminTransaction {
  loadQuestion(id: string): Promise<QuestionAdminRecord | null>;
  validateReferences(input: QuestionAdminInput): Promise<boolean>;
  saveQuestion(record: QuestionAdminRecord): Promise<void>;
  appendAuditLog(input: QuestionAdminAuditInput): Promise<void>;
}
export interface QuestionAdminRepository {
  runInTransaction<T>(
    work: (transaction: QuestionAdminTransaction) => Promise<T>,
  ): Promise<T>;
}

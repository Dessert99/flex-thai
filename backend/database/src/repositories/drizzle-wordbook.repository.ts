/** 단어장 소유권과 lock ordering을 Drizzle transaction으로 구현한다 */
import type {
  WordbookRecord,
  WordbookRemoveInput,
  WordbookRepository,
  WordbookTransferInput,
} from '@flex-thia/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  vocabularies,
  wordbookItems,
  wordbooks,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type WordbookDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type WordbookSession = Pick<
  WordbookDatabase,
  'delete' | 'insert' | 'select' | 'update'
>;
type WordbookRow = typeof wordbooks.$inferSelect;

/** 단어장 unique와 예상하지 못한 저장 충돌을 stable code로 전달한다 */
export class WordbookPersistenceError extends Error {
  constructor(
    readonly code:
      | 'WORDBOOK_NAME_CONFLICT'
      | 'WORDBOOK_PERSISTENCE_CONFLICT',
    readonly operation: string,
  ) {
    super(`${code}:${operation}`);
    this.name = 'WordbookPersistenceError';
  }
}

const toRecord = (row: WordbookRow): WordbookRecord => ({ ...row });

const translatePersistenceError = (error: unknown, operation: string): never => {
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (
    candidate.code === '23505' &&
    candidate.constraint === 'wordbooks_user_name_unique'
  ) {
    throw new WordbookPersistenceError('WORDBOOK_NAME_CONFLICT', operation);
  }
  throw new WordbookPersistenceError(
    'WORDBOOK_PERSISTENCE_CONFLICT',
    operation,
  );
};

const lockOwnedWordbooks = async (
  transaction: WordbookSession,
  userId: string,
  wordbookIds: string[],
): Promise<boolean> => {
  const uniqueIds = [...new Set(wordbookIds)].sort();
  const rows = await transaction
    .select({ id: wordbooks.id })
    .from(wordbooks)
    .where(
      and(
        eq(wordbooks.userId, userId),
        inArray(wordbooks.id, uniqueIds),
      ),
    )
    .orderBy(asc(wordbooks.id))
    .for('update')
    .limit(uniqueIds.length);
  return rows.length === uniqueIds.length;
};

const loadSelectedMemberships = (
  transaction: WordbookSession,
  wordbookId: string,
  vocabularyIds: string[],
) =>
  transaction
    .select({
      vocabularyId: wordbookItems.vocabularyId,
      addedAt: wordbookItems.addedAt,
    })
    .from(wordbookItems)
    .where(
      and(
        eq(wordbookItems.wordbookId, wordbookId),
        inArray(wordbookItems.vocabularyId, vocabularyIds),
      ),
    );

/** 사용자 소유 단어장과 항목 변경을 transaction으로 저장한다 */
export class DrizzleWordbookRepository implements WordbookRepository {
  constructor(private readonly database: WordbookDatabase) {}

  /** 사용자 안의 exact 이름 unique를 DB 제약으로 직렬화한다 */
  async create(
    userId: string,
    name: string,
    now: Date,
  ): Promise<WordbookRecord> {
    try {
      const [row] = await this.database
        .insert(wordbooks)
        .values({ userId, name, createdAt: now, updatedAt: now })
        .returning();
      if (!row) {
        throw new WordbookPersistenceError(
          'WORDBOOK_PERSISTENCE_CONFLICT',
          'create',
        );
      }
      return toRecord(row);
    } catch (error) {
      if (error instanceof WordbookPersistenceError) throw error;
      return translatePersistenceError(error, 'create');
    }
  }

  /** user와 id가 모두 일치하는 단어장만 이름을 변경한다 */
  async rename(
    userId: string,
    wordbookId: string,
    name: string,
    now: Date,
  ): Promise<WordbookRecord | null> {
    try {
      const [row] = await this.database
        .update(wordbooks)
        .set({ name, updatedAt: now })
        .where(
          and(eq(wordbooks.userId, userId), eq(wordbooks.id, wordbookId)),
        )
        .returning();
      return row ? toRecord(row) : null;
    } catch (error) {
      return translatePersistenceError(error, 'rename');
    }
  }

  /** 소유 단어장만 삭제하고 cascade는 membership에만 맡긴다 */
  async delete(userId: string, wordbookId: string): Promise<boolean> {
    const rows = await this.database
      .delete(wordbooks)
      .where(and(eq(wordbooks.userId, userId), eq(wordbooks.id, wordbookId)))
      .returning({ id: wordbooks.id });
    return rows.length === 1;
  }

  /** 소유 단어장을 잠근 뒤 현재 게시 어휘만 멱등 추가한다 */
  addVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
    addedAt: Date,
  ): Promise<
    | 'ADDED'
    | 'ALREADY_EXISTS'
    | 'WORDBOOK_NOT_FOUND'
    | 'VOCABULARY_UNAVAILABLE'
  > {
    return this.database.transaction(async (transaction) => {
      if (!(await lockOwnedWordbooks(transaction, userId, [wordbookId]))) {
        return 'WORDBOOK_NOT_FOUND';
      }
      const availableRows = await transaction
        .select({ id: vocabularies.id })
        .from(vocabularies)
        .where(
          and(
            eq(vocabularies.id, vocabularyId),
            eq(vocabularies.status, 'PUBLISHED'),
          ),
        )
        .limit(1);
      if (availableRows.length === 0) return 'VOCABULARY_UNAVAILABLE';

      const rows = await transaction
        .insert(wordbookItems)
        .values({ wordbookId, vocabularyId, addedAt })
        .onConflictDoNothing()
        .returning({ vocabularyId: wordbookItems.vocabularyId });
      return rows.length === 1 ? 'ADDED' : 'ALREADY_EXISTS';
    });
  }

  /** 공개 상태를 보지 않고 소유 단어장의 membership만 멱등 제거한다 */
  removeVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      if (!(await lockOwnedWordbooks(transaction, userId, [wordbookId]))) {
        return false;
      }
      await transaction
        .delete(wordbookItems)
        .where(
          and(
            eq(wordbookItems.wordbookId, wordbookId),
            eq(wordbookItems.vocabularyId, vocabularyId),
          ),
        );
      return true;
    });
  }

  /** source에 실제 존재하는 선택 membership만 target에 복사한다 */
  copyVocabularies(input: WordbookTransferInput): Promise<boolean> {
    return this.transfer(input, false);
  }

  /** target 복사와 source 삭제를 같은 transaction에서 완료한다 */
  moveVocabularies(input: WordbookTransferInput): Promise<boolean> {
    return this.transfer(input, true);
  }

  /** 공개 상태를 보지 않고 source의 선택 membership만 제거한다 */
  removeVocabularies(input: WordbookRemoveInput): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      if (
        !(await lockOwnedWordbooks(transaction, input.userId, [
          input.wordbookId,
        ]))
      ) {
        return false;
      }
      await transaction
        .delete(wordbookItems)
        .where(
          and(
            eq(wordbookItems.wordbookId, input.wordbookId),
            inArray(wordbookItems.vocabularyId, input.vocabularyIds),
          ),
        );
      return true;
    });
  }

  private transfer(
    input: WordbookTransferInput,
    removeSource: boolean,
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      if (
        !(await lockOwnedWordbooks(transaction, input.userId, [
          input.sourceWordbookId,
          input.targetWordbookId,
        ]))
      ) {
        return false;
      }
      const memberships = await loadSelectedMemberships(
        transaction,
        input.sourceWordbookId,
        input.vocabularyIds,
      );
      if (memberships.length > 0) {
        await transaction
          .insert(wordbookItems)
          .values(
            memberships.map(({ vocabularyId }) => ({
              wordbookId: input.targetWordbookId,
              vocabularyId,
              addedAt: input.transferredAt,
            })),
          )
          .onConflictDoNothing();
      }
      if (removeSource) {
        await transaction
          .delete(wordbookItems)
          .where(
            and(
              eq(wordbookItems.wordbookId, input.sourceWordbookId),
              inArray(wordbookItems.vocabularyId, input.vocabularyIds),
            ),
          );
      }
      return true;
    });
  }
}

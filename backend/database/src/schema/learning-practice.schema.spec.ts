/** 단어 연습 세션·문항·답안 schema의 snapshot과 원자성 제약을 검증한다 */
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  vocabularyPracticeAnswers,
  vocabularyPracticeQuestions,
  vocabularyPracticeSessions,
} from './learning-practice.schema.js';

const uniqueIndexes = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table)
    .indexes.filter((index) => index.config.unique)
    .map((index) => ({
      name: index.config.name,
      columns: index.config.columns.map((column) =>
        'name' in column ? column.name : undefined,
      ),
    }));

const foreignKeys = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();
    return {
      name: foreignKey.getName(),
      columns: reference.columns.map(({ name }) => name),
      foreignColumns: reference.foreignColumns.map(({ name }) => name),
      target: getTableName(reference.foreignTable),
      onDelete: foreignKey.onDelete,
    };
  });

describe('단어 연습 데이터베이스 schema', () => {
  it('세션·문항·답안 table을 기능 전용 이름으로 정의한다', () => {
    expect(getTableName(vocabularyPracticeSessions)).toBe(
      'vocabulary_practice_sessions',
    );
    expect(getTableName(vocabularyPracticeQuestions)).toBe(
      'vocabulary_practice_questions',
    );
    expect(getTableName(vocabularyPracticeAnswers)).toBe(
      'vocabulary_practice_answers',
    );
  });

  it('문항 position과 문항-session 조합을 중복 없이 보존한다', () => {
    expect(getTableColumns(vocabularyPracticeQuestions).id.primary).toBe(true);
    expect(uniqueIndexes(vocabularyPracticeQuestions)).toEqual([
      {
        name: 'vocabulary_practice_questions_session_position_unique',
        columns: ['session_id', 'position'],
      },
      {
        name: 'vocabulary_practice_questions_session_id_unique',
        columns: ['session_id', 'id'],
      },
    ]);
  });

  it('세션 ID와 사용자를 답안 소유권 FK가 참조할 수 있게 고정한다', () => {
    expect(uniqueIndexes(vocabularyPracticeSessions)).toEqual([
      {
        name: 'vocabulary_practice_sessions_id_user_unique',
        columns: ['id', 'user_id'],
      },
    ]);
    expect(foreignKeys(vocabularyPracticeAnswers)).toContainEqual({
      name: 'vocabulary_practice_answers_session_user_fk',
      columns: ['session_id', 'user_id'],
      foreignColumns: ['id', 'user_id'],
      target: 'vocabulary_practice_sessions',
      onDelete: 'restrict',
    });
  });

  it('한 문항 답과 사용자 clientAnswerId 재전송을 중복 저장하지 않는다', () => {
    expect(uniqueIndexes(vocabularyPracticeAnswers)).toEqual([
      {
        name: 'vocabulary_practice_answers_session_question_unique',
        columns: ['session_id', 'question_id'],
      },
      {
        name: 'vocabulary_practice_answers_user_client_unique',
        columns: ['user_id', 'client_answer_id'],
      },
    ]);
  });

  it('답안 question과 session이 같은 composite FK를 사용한다', () => {
    expect(foreignKeys(vocabularyPracticeAnswers)).toContainEqual({
      name: 'vocabulary_practice_answers_question_session_fk',
      columns: ['session_id', 'question_id'],
      foreignColumns: ['session_id', 'id'],
      target: 'vocabulary_practice_questions',
      onDelete: 'restrict',
    });
  });

  it('문항 meaning과 pronunciation이 같은 vocabulary에 속하게 고정한다', () => {
    expect(foreignKeys(vocabularyPracticeQuestions)).toEqual(
      expect.arrayContaining([
        {
          name: 'vocabulary_practice_questions_meaning_vocabulary_fk',
          columns: ['meaning_id', 'vocabulary_id'],
          foreignColumns: ['id', 'vocabulary_id'],
          target: 'vocabulary_meanings',
          onDelete: 'restrict',
        },
        {
          name: 'vocabulary_practice_questions_pronunciation_vocabulary_fk',
          columns: ['pronunciation_id', 'vocabulary_id'],
          foreignColumns: ['id', 'vocabulary_id'],
          target: 'vocabulary_pronunciations',
          onDelete: 'restrict',
        },
      ]),
    );
  });

  it('source 단어장 삭제 후 null을 허용하고 이름 snapshot은 유지한다', () => {
    expect(foreignKeys(vocabularyPracticeSessions)).toContainEqual({
      name: 'vocabulary_practice_sessions_source_wordbook_id_wordbooks_id_fk',
      columns: ['source_wordbook_id'],
      foreignColumns: ['id'],
      target: 'wordbooks',
      onDelete: 'set null',
    });
  });

  it('문항은 선택지·정답·전체 카드 snapshot column을 보존한다', () => {
    expect(Object.keys(vocabularyPracticeQuestions)).toEqual(
      expect.arrayContaining([
        'options',
        'correctOptionId',
        'cardSnapshot',
        'audioStorageKey',
      ]),
    );
  });

  it('질문 수·상태·audio와 source 조합 check를 제공한다', () => {
    expect(
      [
        ...getTableConfig(vocabularyPracticeSessions).checks,
        ...getTableConfig(vocabularyPracticeQuestions).checks,
      ].map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        'vocabulary_practice_sessions_question_count_range',
        'vocabulary_practice_sessions_status_completed_at_match',
        'vocabulary_practice_sessions_source_match',
        'vocabulary_practice_questions_audio_fields_match',
      ]),
    );
  });
});

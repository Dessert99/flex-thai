import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { questionAttempts } from './learning.schema.js';
import { questions, questionVocabularies } from './questions.schema.js';
describe('문제·사용 어휘·풀이 저장 제약', () => {
  it('문제·어휘 쌍을 중복 저장할 수 없다', () => {
    expect(
      getTableConfig(questionVocabularies).primaryKeys[0]?.columns.map(
        (column) => column.name,
      ),
    ).toEqual(['question_id', 'vocabulary_id']);
  });
  it('뜻은 연결된 어휘의 뜻이어야 한다', () => {
    const fk = getTableConfig(questionVocabularies).foreignKeys.find(
      (key) => key.getName() === 'question_vocabularies_meaning_owner_fk',
    )!;
    expect(fk.reference().columns.map((column) => column.name)).toEqual([
      'meaning_id',
      'vocabulary_id',
    ]);
    expect(fk.reference().foreignColumns.map((column) => column.name)).toEqual([
      'id',
      'vocabulary_id',
    ]);
  });
  it('풀이 기록이 있는 문제 삭제를 막고 당시 내용을 필수 보존한다', () => {
    expect(questionAttempts.questionSnapshot.notNull).toBe(true);
    expect(
      getTableConfig(questionAttempts).foreignKeys.some(
        (key) =>
          key.reference().foreignTable === questions &&
          key.onDelete === 'restrict',
      ),
    ).toBe(true);
  });
});

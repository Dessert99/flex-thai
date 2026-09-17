/** 공용 어휘의 생성·게시·숨김·복구 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  createVocabularyDraft,
  hideVocabulary,
  publishVocabulary,
  restoreVocabulary,
} from './vocabulary.js';

describe('Vocabulary 공용 어휘 상태 전이', () => {
  it('표시 태국어를 보존하고 정규화 표기를 중복 키로 만든다', () => {
    expect(
      createVocabularyDraft({
        id: 'vocabulary-id',
        thai: '  สวัสดี\u200B   ครับ  ',
        kind: 'EXPRESSION',
      }),
    ).toMatchObject({
      thai: '  สวัสดี\u200B   ครับ  ',
      normalizedThai: 'สวัสดี ครับ',
      status: 'DRAFT',
    });
  });

  it('게시 어휘는 숨긴 뒤 복구할 수 있다', () => {
    const published = publishVocabulary(
      createVocabularyDraft({
        id: 'vocabulary-id',
        thai: 'สวัสดี',
        kind: 'WORD',
      }),
    );

    expect(restoreVocabulary(hideVocabulary(published)).status).toBe(
      'PUBLISHED',
    );
  });
});

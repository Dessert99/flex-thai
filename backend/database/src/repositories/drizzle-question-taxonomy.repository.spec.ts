/** 문제 분류 설정 adapter의 기본 버전 결정을 검증한다 */
import { describe, expect, it } from 'vitest';
import { defaultQuestionTypeVersionSettings } from './drizzle-question-taxonomy.repository.js';

describe('문제 분류 설정 기본 버전', () => {
  it('듣기 반응 테스트는 3지선다 STANDARD_CHOICE를 사용한다', () => {
    expect(defaultQuestionTypeVersionSettings('LISTENING_RESPONSE')).toEqual({
      template: 'STANDARD_CHOICE',
      optionCount: 3,
      decisionRules: { mode: 'single-choice' },
    });
  });

  it('읽기 비문 찾기는 4개 inline span을 사용한다', () => {
    expect(
      defaultQuestionTypeVersionSettings('READING_ERROR_IDENTIFICATION'),
    ).toEqual({
      template: 'INLINE_SPAN_CHOICE',
      optionCount: 4,
      decisionRules: { mode: 'single-choice' },
    });
  });
});

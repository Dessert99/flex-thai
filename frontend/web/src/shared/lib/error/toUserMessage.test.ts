/** 공통 오류 경계가 서버 내부 설명을 숨기고 안전한 문구만 만드는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api';
import { toUserMessage } from './toUserMessage';

describe('toUserMessage', () => {
  it('알 수 없는 Problem code를 일반 문구와 요청 ID로 변환한다', () => {
    const message = toUserMessage(
      new ApiError({
        kind: 'problem',
        problem: {
          type: 'https://flex-thia.dev/problems/new-problem',
          title: '노출하면 안 되는 서버 설명',
          status: 409,
          code: 'NEW_PROBLEM_CODE',
          requestId: 'request-safe',
          fieldErrors: [],
        },
      }),
    );

    expect(message).toEqual({
      message: '요청을 처리하지 못했습니다. 다시 시도해 주세요.',
      requestId: 'request-safe',
    });
    expect(message?.message).not.toContain('서버 설명');
  });

  it('호출자가 취소한 요청은 사용자 오류 문구를 만들지 않는다', () => {
    expect(toUserMessage(new ApiError({ kind: 'cancelled' }))).toBeNull();
  });

  it('예상하지 못한 오류는 일반 복구 문구로 제한한다', () => {
    expect(toUserMessage(new Error('내부 render 상세'))).toEqual({
      message: '예상하지 못한 문제가 발생했습니다. 다시 시도해 주세요.',
    });
  });
});

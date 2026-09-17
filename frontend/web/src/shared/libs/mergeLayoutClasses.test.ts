import { describe, expect, it } from 'vitest';
import { mergeLayoutClasses } from './mergeLayoutClasses';

describe('mergeLayoutClasses', () => {
  it('사용자 정의 패딩과 간격을 뒤에 전달한 값으로 교체한다', () => {
    expect(mergeLayoutClasses('p-page gap-cluster', 'p-section gap-none')).toBe(
      'p-section gap-none',
    );
  });
  it('축별 예외와 반응형 조건은 기본값과 함께 유지한다', () => {
    expect(
      mergeLayoutClasses('p-page gap-cluster', 'px-none md:gap-section'),
    ).toBe('p-page gap-cluster px-none md:gap-section');
  });
  it('최대 너비와 열 개수도 마지막 값으로 병합한다', () => {
    expect(
      mergeLayoutClasses(
        'max-w-content grid-cols-1',
        'max-w-form grid-cols-2 md:grid-cols-3',
      ),
    ).toBe('max-w-form grid-cols-2 md:grid-cols-3');
  });
});

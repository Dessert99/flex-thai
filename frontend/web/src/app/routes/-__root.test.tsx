/** root route가 예상하지 못한 render 오류와 취소를 안전하게 복구하는지 검증한다 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { getRouteTitle, RootRouteError } from './__root';

describe('root route 오류 경계', () => {
  it('render 예외에 일반 문구를 표시하고 boundary reset을 실행한다', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();

    render(
      <RootRouteError
        error={new Error('render 상세')}
        reset={reset}
      />,
    );

    expect(
      screen.getByText(
        '예상하지 못한 문제가 발생했습니다. 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('Problem 요청 ID를 표시하되 서버 title은 숨긴다', () => {
    render(
      <RootRouteError
        error={
          new ApiError({
            kind: 'problem',
            problem: {
              type: 'https://flex-thia.dev/problems/internal',
              title: '노출하면 안 되는 title',
              status: 500,
              code: 'UNKNOWN_SERVER_CODE',
              requestId: 'request-boundary',
              fieldErrors: [],
            },
          })
        }
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText('요청 ID: request-boundary')).toBeInTheDocument();
    expect(
      screen.queryByText('노출하면 안 되는 title'),
    ).not.toBeInTheDocument();
  });

  it('취소된 요청에는 전역 오류 화면을 표시하지 않는다', () => {
    const { container } = render(
      <RootRouteError
        error={new ApiError({ kind: 'cancelled' })}
        reset={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('root route 제목', () => {
  it.each([
    ['/login/challenge', '이메일 인증 코드'],
    ['/login/confirm', '이메일 링크 확인'],
    ['/wordbooks', '내 단어장'],
    ['/wordbooks/00000000-0000-4000-8000-000000000101', '단어장 상세'],
    ['/practice', '단어 연습'],
    ['/practice/00000000-0000-4000-8000-000000000101', '단어 연습'],
    ['/practice/00000000-0000-4000-8000-000000000101/result', '단어 연습 결과'],
    ['/concepts', '개념 학습'],
    ['/concepts/00000000-0000-4000-8000-000000000102', '개념 상세'],
    ['/admin/concepts', '개념 관리'],
    ['/admin/content-error-reports', '콘텐츠 오류 신고 관리'],
    ['/admin/users', '사용자 관리'],
    ['/admin/audit-logs', '감사 기록'],
    ['/admin/question-settings', '문제 유형 설정'],
    ['/admin/content-production', '콘텐츠 제작'],
    [
      '/admin/content-production/jobs/00000000-0000-4000-8000-000000000103',
      '콘텐츠 제작 작업 상세',
    ],
    ['/admin/content-production/candidates', '문제 후보 검수'],
    [
      '/admin/content-production/candidates/00000000-0000-4000-8000-000000000104',
      '문제 후보 상세',
    ],
    ['/admin/content-production/vocabulary-candidates', '어휘 후보 검수'],
    [
      '/admin/content-production/vocabulary-candidates/00000000-0000-4000-8000-000000000106',
      '어휘 후보 상세',
    ],
    ['/admin/content-production/presets', '콘텐츠 제작 Preset'],
    ['/admin/tts', 'TTS 운영'],
    ['/admin/tts/jobs/00000000-0000-4000-8000-000000000105', 'TTS 작업 상세'],
    ['/admin/tts/presets', 'TTS Preset'],
    ['/admin/usage-cost', 'AI·TTS 사용량·비용'],
  ])('%s 경로에 %s 제목을 제공한다', (pathname, title) => {
    expect(getRouteTitle(pathname)).toBe(title);
  });
});

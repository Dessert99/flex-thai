/** 콘텐츠 제작 console의 독립 query 상태를 검증한다 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionConsolePageView } from './ContentProductionConsolePageView';

const handlers = {
  onFile: vi.fn(),
  onPreview: vi.fn(),
  onSubmit: vi.fn(),
  onRetryJobs: vi.fn(),
  onRetryPresets: vi.fn(),
};

describe('ContentProductionConsolePageView', () => {
  it('preset 실패와 빈 job 상태를 서로 독립적으로 표시한다', () => {
    render(
      <ContentProductionConsolePageView
        {...handlers}
        jobs={{ items: [] }}
        jobsError={false}
        jobsLoading={false}
        presetsError
        presetsLoading={false}
      />,
    );
    expect(screen.getByText('Preset을 불러오지 못했습니다.')).toBeVisible();
    expect(screen.getByText('아직 작업이 없습니다.')).toBeVisible();
  });

  it('빠른 설정과 고급 설정 탭을 제공한다', () => {
    render(
      <ContentProductionConsolePageView
        {...handlers}
        jobs={{ items: [] }}
        jobsError={false}
        jobsLoading={false}
        presets={{ items: [] }}
        presetsError={false}
        presetsLoading={false}
      />,
    );
    expect(screen.getByRole('tab', { name: '빠른 설정' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '고급 설정' })).toBeVisible();
  });
});

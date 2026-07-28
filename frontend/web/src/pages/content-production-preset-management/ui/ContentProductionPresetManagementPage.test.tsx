/** 콘텐츠 제작 preset 운영 화면의 history와 revision command를 검증한다 */
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionPresetManagementPageView } from './ContentProductionPresetManagementPageView';

const preset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '어휘',
  version: 1,
  purpose: 'VOCABULARY_EXTRACTION',
  parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
  enabled: false,
  revision: 4,
  createdAt: '2026-07-28T00:00:00.000Z',
} satisfies ContentProductionPresetVersion;

describe('ContentProductionPresetManagementPageView', () => {
  it('비활성 history와 revision을 숨기지 않고 운영 command를 전달한다', () => {
    const onSetEnabled = vi.fn();
    const onSelect = vi.fn();
    render(
      <ContentProductionPresetManagementPageView
        conflict={false}
        data={{ items: [preset] }}
        error={false}
        loading={false}
        onCreate={vi.fn()}
        onCreateVersion={vi.fn()}
        onRetry={vi.fn()}
        onSelect={onSelect}
        onSetEnabled={onSetEnabled}
        pending={false}
      />,
    );
    expect(screen.getByText('비활성')).toBeVisible();
    expect(screen.getByText('4')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '활성화' }));
    fireEvent.click(screen.getByRole('button', { name: 'vNext' }));
    expect(onSetEnabled).toHaveBeenCalledWith(preset);
    expect(onSelect).toHaveBeenCalledWith(preset);
  });
});

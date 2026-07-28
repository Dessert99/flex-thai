/** 콘텐츠 제작 preset form의 typed version 복제를 검증한다 */
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionPresetForm } from './ContentProductionPresetForm';

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '어휘',
  version: 1,
  purpose: 'VOCABULARY_EXTRACTION',
  parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
  enabled: true,
  revision: 2,
  createdAt: '2026-07-28T00:00:00.000Z',
} satisfies ContentProductionPresetVersion;

describe('ContentProductionPresetForm', () => {
  it('기존 parameter를 직접 수정하지 않고 다음 version 값을 전달한다', () => {
    const onCreateVersion = vi.fn();
    render(
      <ContentProductionPresetForm
        base={base}
        onCreate={vi.fn()}
        onCreateVersion={onCreateVersion}
      />,
    );
    fireEvent.change(screen.getByLabelText('중복 의심 최대 코드 포인트 거리'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: '새 버전 만들기' }));
    expect(onCreateVersion).toHaveBeenCalledWith(base.id, {
      suspectedDuplicateMaxCodePointDistance: 3,
    });
    expect(base.parameters.suspectedDuplicateMaxCodePointDistance).toBe(1);
    expect(
      screen.queryByRole('textbox', { name: /JSON/u }),
    ).not.toBeInTheDocument();
  });
});

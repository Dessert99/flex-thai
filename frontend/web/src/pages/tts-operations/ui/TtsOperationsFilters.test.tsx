/** TTS 작업 UTC 기간이 브라우저 local 시각과 손실 없이 왕복하는지 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  fromTtsOperationsDateTimeLocal,
  toTtsOperationsDateTimeLocal,
} from '../model/ttsOperationsDateTime';
import { TtsOperationsFilters } from './TtsOperationsFilters';

describe('TTS 작업 기간 필터', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'Asia/Seoul');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('Asia/Seoul 날짜 경계에서 UTC ISO를 local 입력으로 표시하고 같은 값으로 복원한다', () => {
    const onChange = vi.fn();
    render(
      <TtsOperationsFilters
        onChange={onChange}
        onReset={vi.fn()}
        search={{
          from: '2026-07-31T15:30:00.000Z',
          page: 1,
          pageSize: 20,
        }}
      />,
    );

    const input = screen.getByLabelText('시작 시각');
    expect(input).toHaveValue('2026-08-01T00:30');
    expect(input).toHaveAttribute('step', '0.001');

    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith({
      from: '2026-07-31T15:30:00.000Z',
    });
  });

  it('초·밀리초가 있는 UTC ISO도 datetime-local 왕복에서 잃지 않는다', () => {
    const iso = '2026-07-31T15:30:45.123Z';

    const local = toTtsOperationsDateTimeLocal(iso);

    expect(local).toBe('2026-08-01T00:30:45.123');
    expect(fromTtsOperationsDateTimeLocal(local)).toBe(iso);
  });
});

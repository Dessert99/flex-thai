/** 콘텐츠 제작 job 상세의 공개 상태와 retry 조건을 검증한다 */
import type { ContentProductionJobDetailResponse } from '@flex-thia/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionJobDetailPageView } from './ContentProductionJobDetailPageView';

const id = '00000000-0000-4000-8000-000000000001';
const job = {
  id,
  purpose: 'VOCABULARY_EXTRACTION',
  status: 'FAILED',
  attempt: 1,
  createdAt: '2026-07-28T00:00:00.000Z',
  completedAt: null,
  counts: {
    total: 1,
    succeeded: 0,
    needsAttention: 0,
    failed: 1,
  },
  presetSnapshot: {
    id,
    name: '어휘',
    version: 2,
    purpose: 'VOCABULARY_EXTRACTION',
    parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
  },
  inputs: [{ uploadId: id, inputType: 'TEXT', sizeBytes: 3 }],
  items: [
    {
      id,
      status: 'FAILED',
      attempt: 1,
      retryable: true,
      errorCode: 'PUBLIC_ERROR',
    },
  ],
} satisfies ContentProductionJobDetailResponse;

describe('ContentProductionJobDetailPageView', () => {
  it('공개 count·오류와 job 범위 후보 링크를 표시한다', () => {
    render(
      <ContentProductionJobDetailPageView
        job={job}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/PUBLIC_ERROR/u)).toBeVisible();
    expect(screen.getByText(/실패 1/u)).toBeVisible();
    expect(screen.getByRole('link', { name: '후보 검수' })).toHaveAttribute(
      'href',
      `/admin/content-production/candidates?jobId=${id}`,
    );
    expect(screen.getByRole('button', { name: '재시도' })).toBeEnabled();
  });

  it('재시도 가능한 항목이 없으면 재시도를 막는다', () => {
    render(
      <ContentProductionJobDetailPageView
        job={{ ...job, items: [{ ...job.items[0]!, retryable: false }] }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '재시도' })).toBeDisabled();
  });
});

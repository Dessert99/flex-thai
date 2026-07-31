import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VocabularyCandidateManagementPageView } from './VocabularyCandidateManagementPageView';

const item = (
  id: string,
  reviewStatus: 'PENDING' | 'APPROVED' | 'DISCARDED',
  resultGroup: 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED',
) => ({
  id,
  jobId: '00000000-0000-4000-8000-000000000010',
  jobItemId: '00000000-0000-4000-8000-000000000011',
  jobAttempt: 1,
  ordinal: 0,
  thai: `ไทย-${id.at(-1)}`,
  kind: 'WORD' as const,
  meanings: [{ meaningKo: '뜻', partOfSpeech: '명사', difficulty: 1 }],
  classification: 'NEW_VOCABULARY' as const,
  resultGroup,
  matchedVocabularyId: null,
  suspectedMatches: [],
  review:
    reviewStatus === 'APPROVED'
      ? {
          status: 'APPROVED' as const,
          revision: 1,
          resolution: {
            kind: 'EXISTING_LINKED' as const,
            vocabularyId: '00000000-0000-4000-8000-000000000012',
          },
        }
      : {
          status: reviewStatus,
          revision: reviewStatus === 'PENDING' ? 0 : 1,
          resolution: null,
        },
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
});

describe('어휘 후보 목록 화면', () => {
  it('pending·validation failure·approved·discarded 상태와 상세 route를 구분한다', () => {
    render(
      <VocabularyCandidateManagementPageView
        data={{
          items: [
            item('00000000-0000-4000-8000-000000000001', 'PENDING', 'NORMAL'),
            item('00000000-0000-4000-8000-000000000002', 'PENDING', 'FAILED'),
            item('00000000-0000-4000-8000-000000000003', 'APPROVED', 'NORMAL'),
            item('00000000-0000-4000-8000-000000000004', 'DISCARDED', 'NORMAL'),
          ],
          page: { page: 1, pageSize: 20, totalItems: 4, totalPages: 1 },
        }}
        error={false}
        loading={false}
        onPageChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getAllByText('검수 대기')).toHaveLength(1);
    expect(screen.getByText('검증 실패')).toBeVisible();
    expect(screen.getByText('승인 완료')).toBeVisible();
    expect(screen.getByText('폐기 완료')).toBeVisible();
    expect(screen.getAllByRole('link', { name: '상세 열기' })).toHaveLength(4);
  });
});

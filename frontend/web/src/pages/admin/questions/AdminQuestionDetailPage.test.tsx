import { AdminQuestionDetailPageView } from '@/features/learning/components/admin-question-detail/AdminQuestionDetailPageView';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
vi.mock('@/shared/apis/auth/authenticatedRequest', () => ({
  authenticatedRequest: vi.fn(() =>
    Promise.resolve({ questionTypes: [], topics: [], tags: [], items: [] }),
  ),
}));
const data = {
  questionId: id,
  typeVersionId: id,
  topicId: id,
  tagIds: [],
  version: 2,
  status: 'PUBLISHED' as const,
  difficulty: 2,
  passage: null,
  prompt: '질문',
  options: [
    { id, text: '가' },
    { id: other, text: '나' },
  ],
  correctOptionId: id,
  explanation: '해설',
  vocabularies: [],
  createdAt: '2026-09-17T00:00:00Z',
  updatedAt: '2026-09-17T00:00:00Z',
  publishedAt: '2026-09-17T00:00:00Z',
};
describe('현재 문제 편집', () => {
  it('재풀이 기본값과 수정 시각을 함께 제출한다', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    renderWithProviders(
      <AdminQuestionDetailPageView
        data={data}
        onSave={save}
        onStatus={() => undefined}
        pending={false}
        error={false}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
    await user.click(screen.getByRole('button', { name: '변경 저장' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 2,
        expectedUpdatedAt: data.updatedAt,
        requiresRetry: true,
      }),
    );
  });
});

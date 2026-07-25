/** 어휘 상태 action의 확인 전송과 server-confirmed event를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyStateAction } from './VocabularyStateAction';

const vocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

describe('어휘 상태 변경', () => {
  it.each(['publish', 'hide', 'restore'] as const)(
    '%s는 서버 성공 뒤 confirmed event를 보낸다',
    async (action) => {
      mocks.authenticatedRequest.mockReset().mockResolvedValue(undefined);
      const onConfirmed = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <VocabularyStateAction
          action={action}
          onConfirmed={onConfirmed}
          vocabularyId={vocabularyId}
        />,
      );
      await user.click(
        screen.getByRole('button', { name: actionLabel(action) }),
      );
      if (action !== 'restore') {
        await user.click(
          screen.getByRole('button', { name: confirmLabel(action) }),
        );
      }
      expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: `/admin/vocabularies/${vocabularyId}/${action}`,
        }),
      );
      expect(onConfirmed).toHaveBeenCalledWith({ action, vocabularyId });
    },
  );
});

function actionLabel(action: 'hide' | 'publish' | 'restore') {
  return { hide: '어휘 숨기기', publish: '어휘 게시', restore: '어휘 복구' }[
    action
  ];
}

function confirmLabel(action: 'hide' | 'publish') {
  return { hide: '숨기기 확인', publish: '게시 확인' }[action];
}

/** 관리자 문제 preview·diff·버전 TTS 생성 상호작용을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import {
  createQuestionDetail,
  createReadyReadiness,
  questionId,
} from './AdminQuestionDetailPage.fixtures';
import { AdminQuestionDetailPageContainer } from './AdminQuestionDetailPageContainer';

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('관리자 문제 inspection workflow', () => {
  it('실제 문제 preview를 keyboard 선택 가능하게 표시하고 두 버전 차이를 비교한다', async () => {
    mockDetailAndReadiness();
    const user = userEvent.setup();

    renderDetail();

    expect(
      await screen.findByRole('region', {
        name: '버전 3 문제 미리보기',
      }),
    ).toBeVisible();
    const option = screen.getAllByRole('radio')[0];
    if (!option) throw new Error('preview 선택지가 필요합니다.');
    option.focus();
    await user.keyboard('[Space]');
    expect(option).toBeChecked();
    expect(screen.getByText('본문 변경')).toBeVisible();
    expect(screen.getByText('상태 변경')).toBeVisible();
  });

  it('버전 TTS 생성 중 action을 막고 성공 job 상세 링크를 표시한다', async () => {
    let resolveTts:
      | ((value: {
          jobIds: string[];
          scheduledSentenceCount: number;
          reusedReadySentenceCount: number;
        }) => void)
      | undefined;
    const jobId = '01933b6a-8f13-7a19-b7e5-536d70f57aad';
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (path.endsWith('/tts-jobs')) {
          return new Promise((resolve) => {
            resolveTts = resolve;
          });
        }
        if (path.includes('/readiness')) {
          return Promise.resolve(createReadyReadiness());
        }
        return Promise.resolve(createQuestionDetail());
      },
    );
    const user = userEvent.setup();
    renderDetail();

    const action = await screen.findByRole('button', {
      name: '버전 TTS 재생성',
    });
    await user.click(action);
    expect(screen.getByRole('button', { name: 'TTS 예약 중' })).toBeDisabled();
    resolveTts?.({
      jobIds: [jobId],
      scheduledSentenceCount: 1,
      reusedReadySentenceCount: 0,
    });

    expect(
      await screen.findByRole('link', { name: '생성된 TTS 작업 보기' }),
    ).toHaveAttribute('href', `/admin/tts/jobs/${jobId}`);
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminQuestionDetailPageContainer questionId={questionId} />,
  );
}

function mockDetailAndReadiness() {
  mocks.authenticatedRequest.mockImplementation(({ path }: { path: string }) =>
    Promise.resolve(
      path.includes('/readiness')
        ? createReadyReadiness()
        : createQuestionDetail(),
    ),
  );
}

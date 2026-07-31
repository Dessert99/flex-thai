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
import { QuestionVersionPreview } from './QuestionVersionPreview';

interface MockRequest {
  headers?: HeadersInit;
  path: string;
}

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn<(request: MockRequest) => Promise<unknown>>(),
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
});

describe('관리자 문제 버전 TTS action', () => {
  it('버전 TTS 생성 중 action을 막고 성공 job 상세 링크를 표시한다', async () => {
    let resolveTts:
      | ((value: {
          jobIds: string[];
          scheduledSentenceCount: number;
          reusedReadySentenceCount: number;
        }) => void)
      | undefined;
    const jobId = '01933b6a-8f13-7a19-b7e5-536d70f57aad';
    mocks.authenticatedRequest.mockImplementation(({ path }) => {
      if (path.endsWith('/tts-jobs')) {
        return new Promise((resolve) => {
          resolveTts = resolve;
        });
      }
      if (path.includes('/readiness')) {
        return Promise.resolve(createReadyReadiness());
      }
      return Promise.resolve(createQuestionDetail());
    });
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

  it('실패한 같은 사용자 action의 재시도에는 처음 만든 request ID를 재사용한다', async () => {
    let attempt = 0;
    mocks.authenticatedRequest.mockImplementation(({ path }) => {
      if (path.endsWith('/tts-jobs')) {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('temporary failure'))
          : Promise.resolve({
              jobIds: [],
              scheduledSentenceCount: 0,
              reusedReadySentenceCount: 1,
            });
      }
      return Promise.resolve(
        path.includes('/readiness')
          ? createReadyReadiness()
          : createQuestionDetail(),
      );
    });
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole('button', { name: '버전 TTS 재생성' }),
    );
    expect(
      await screen.findByText('버전 TTS를 예약하지 못했습니다.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '버전 TTS 재생성' }));
    expect(
      await screen.findByText('모든 필수 문장이 READY 음성을 재사용합니다.'),
    ).toBeVisible();

    const ttsRequests = mocks.authenticatedRequest.mock.calls
      .map(([request]) => request)
      .filter(({ path }) => path.endsWith('/tts-jobs'));
    expect(ttsRequests).toHaveLength(2);
    const firstHeaders = new Headers(ttsRequests[0]?.headers);
    const secondHeaders = new Headers(ttsRequests[1]?.headers);
    const requestId = firstHeaders.get('X-Request-ID');
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(secondHeaders.get('X-Request-ID')).toBe(requestId);
  });
});

describe('관리자 문제 display mode preview', () => {
  it('AUDIO_THEN_REVEAL은 audio control 뒤 keyboard action으로 문장을 공개한다', async () => {
    const { originalText, version } = previewVersion('AUDIO_THEN_REVEAL');
    const user = userEvent.setup();

    renderWithProviders(<QuestionVersionPreview version={version as never} />);

    const article = screen.getAllByRole('article')[0];
    if (!article) throw new Error('preview 문장이 필요합니다.');
    const audio = article.querySelector<HTMLAudioElement>('audio[controls]');
    if (!audio) throw new Error('preview audio control이 필요합니다.');
    expect(audio).toHaveAccessibleName('문장 음성 재생');
    expect(article).not.toHaveTextContent(originalText);
    const reveal = screen.getByRole('button', { name: '문장 내용 공개' });
    reveal.focus();
    await user.keyboard('[Enter]');
    expect(article).toHaveTextContent(originalText);
  });

  it('AUDIO는 audio control만 표시하고 문장 내용을 공개하지 않는다', () => {
    const { originalText, version } = previewVersion('AUDIO');

    renderWithProviders(<QuestionVersionPreview version={version as never} />);

    const article = screen.getAllByRole('article')[0];
    if (!article) throw new Error('preview 문장이 필요합니다.');
    const audio = article.querySelector<HTMLAudioElement>('audio[controls]');
    if (!audio) throw new Error('preview audio control이 필요합니다.');
    expect(audio).toHaveAccessibleName('문장 음성 재생');
    expect(article).not.toHaveTextContent(originalText);
    expect(
      screen.queryByRole('button', { name: '문장 내용 공개' }),
    ).not.toBeInTheDocument();
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminQuestionDetailPageContainer questionId={questionId} />,
  );
}

function mockDetailAndReadiness() {
  mocks.authenticatedRequest.mockImplementation(({ path }) =>
    Promise.resolve(
      path.includes('/readiness')
        ? createReadyReadiness()
        : createQuestionDetail(),
    ),
  );
}

function previewVersion(displayMode: 'AUDIO' | 'AUDIO_THEN_REVEAL') {
  const version = structuredClone(createQuestionDetail().versions[0]);
  if (!version) throw new Error('preview version이 필요합니다.');
  const block = version.blocks[0];
  if (!block) throw new Error('preview block이 필요합니다.');
  const sentence = block.sentences[0];
  if (!sentence) throw new Error('preview 문장이 필요합니다.');
  block.displayMode = displayMode;
  return { originalText: sentence.sentence.originalText, version };
}

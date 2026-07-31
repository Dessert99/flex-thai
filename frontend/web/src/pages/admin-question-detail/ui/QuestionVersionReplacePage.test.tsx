/** 문제 버전 복제·직접 URL 교체·검증 결과 경계를 검증한다 */
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { CloneQuestionVersionButton } from './CloneQuestionVersionButton';
import { QuestionVersionReplacePageContainer } from './QuestionVersionReplacePageContainer';

const questionId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const versionId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';
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

describe('문제 버전 복제', () => {
  it('body 없이 복제하고 반환된 DRAFT version ID를 전달한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      questionId,
      versionId,
      version: 4,
      status: 'DRAFT',
      validationStatus: 'PENDING',
    });
    const onCloned = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CloneQuestionVersionButton
        onCloned={onCloned}
        questionId={questionId}
      />,
    );

    await user.click(screen.getByRole('button', { name: '새 DRAFT 복제' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/admin/questions/${questionId}/versions`,
      }),
    );
    expect(mocks.authenticatedRequest.mock.calls[0]?.[0]).not.toHaveProperty(
      'body',
    );
    expect(onCloned).toHaveBeenCalledWith({ questionId, versionId });
  });
});

describe('문제 버전 교체 URL', () => {
  it('question detail에 versionId가 없으면 교체 form을 표시하지 않는다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestionDetail([]));

    renderReplacePage();

    expect(
      await screen.findByText('요청한 문제 버전을 찾을 수 없습니다.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('canonical 문제 버전 JSON'),
    ).not.toBeInTheDocument();
  });

  it('게시 버전은 교체 form에 진입할 수 없다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(
      createQuestionDetail([createVersion('PUBLISHED')]),
    );

    renderReplacePage();

    expect(
      await screen.findByText('DRAFT 버전만 전체 교체할 수 있습니다.'),
    ).toBeInTheDocument();
  });

  it('클라이언트 계약 검증 실패에는 교체 요청을 보내지 않는다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(
      createQuestionDetail([createVersion('DRAFT')]),
    );
    const user = userEvent.setup();
    renderReplacePage();

    fireEvent.change(await screen.findByLabelText('canonical 문제 버전 JSON'), {
      target: { value: '{"difficulty":6}' },
    });
    await user.click(screen.getByRole('button', { name: '전체 교체 검토' }));

    expect(await screen.findByText(/questionTypeSlug/u)).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledOnce();
  });

  it('불변 409를 inline으로 표시하고 READY처럼 처리하지 않는다', async () => {
    mocks.authenticatedRequest
      .mockResolvedValueOnce(createQuestionDetail([createVersion('DRAFT')]))
      .mockRejectedValueOnce(createProblemError(409));
    const user = userEvent.setup();
    renderReplacePage();

    fireEvent.change(await screen.findByLabelText('canonical 문제 버전 JSON'), {
      target: { value: JSON.stringify(createValidPayload()) },
    });
    await user.click(screen.getByRole('button', { name: '전체 교체 검토' }));
    await user.click(screen.getByRole('button', { name: '전체 교체 확정' }));

    expect(
      await screen.findByText('게시되었거나 변경할 수 없는 버전입니다.'),
    ).toBeInTheDocument();
  });

  it('FAILED 검증 보고서를 HTTP 오류가 아닌 결과로 표시한다', async () => {
    mocks.authenticatedRequest
      .mockResolvedValueOnce(createQuestionDetail([createVersion('DRAFT')]))
      .mockResolvedValueOnce({
        questionId,
        versionId,
        version: 3,
        status: 'DRAFT',
        validationStatus: 'PENDING',
      })
      .mockResolvedValueOnce({
        status: 'FAILED',
        issues: [{ path: 'options.0', code: 'MEDIA_ASSET_NOT_READY' }],
      });
    const user = userEvent.setup();
    renderReplacePage();

    fireEvent.change(await screen.findByLabelText('canonical 문제 버전 JSON'), {
      target: { value: JSON.stringify(createValidPayload()) },
    });
    await user.click(screen.getByRole('button', { name: '전체 교체 검토' }));
    await user.click(screen.getByRole('button', { name: '전체 교체 확정' }));
    await user.click(
      await screen.findByRole('button', { name: '버전 검증 실행' }),
    );

    expect(
      await screen.findByText('options.0 · MEDIA_ASSET_NOT_READY'),
    ).toBeInTheDocument();
  });

  it('현재 graph를 구조화 form으로 편집하고 오류 field path를 해당 입력에 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(
      createQuestionDetail([createVersion('DRAFT')]),
    );
    const user = userEvent.setup();
    renderReplacePage();

    const thaiInputs = await screen.findAllByLabelText('태국어 문장');
    const firstThaiInput = thaiInputs[0];
    if (!firstThaiInput) throw new Error('태국어 문장 입력이 필요합니다.');
    await user.clear(firstThaiInput);
    await user.click(
      screen.getByRole('button', { name: '구조화 내용으로 전체 교체' }),
    );

    expect(
      screen.getAllByText(
        /blocks\.0\.sentences\.0\.sentence\.originalText/u,
      )[0],
    ).toBeVisible();
    expect(mocks.authenticatedRequest).toHaveBeenCalledOnce();
  });
});

function renderReplacePage() {
  return renderWithProviders(
    <QuestionVersionReplacePageContainer
      questionId={questionId}
      versionId={versionId}
    />,
  );
}

function createQuestionDetail(versions: ReturnType<typeof createVersion>[]) {
  return {
    questionId,
    status: 'DRAFT',
    currentPublishedVersionId: null,
    versions,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  };
}

function createVersion(status: 'DRAFT' | 'PUBLISHED') {
  const optionId = '01933b6a-8f13-7a19-b7e5-536d70f57aac';
  const sentenceId = '01933b6a-8f13-7a19-b7e5-536d70f57aae';
  const sentence = {
    id: sentenceId,
    originalText: 'สวัสดี',
    translationKo: '안녕하세요',
    pronunciationKo: '싸왓디',
    toneMarks: '',
    mediaAssetId: questionId,
    audio: {
      status: 'READY',
      readUrl: 'https://media.example.com/question.wav',
    },
    tokens: [],
    expressions: [],
  } as const;
  return {
    id: versionId,
    version: 3,
    status,
    validation: { status: 'PENDING', issues: [], validatedAt: null },
    questionType: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
      slug: 'dialogue-choice',
      version: 1,
      skill: 'LISTENING',
      template: 'DIALOGUE_CHOICE',
    },
    difficulty: 4,
    topic: {
      id: questionId,
      slug: 'general',
      displayName: '일반',
    },
    tags: [],
    blocks: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aaf',
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        position: 0,
        sentences: [
          {
            position: 0,
            speaker: null,
            sentenceVersionId: sentenceId,
            sentence,
          },
        ],
      },
    ],
    options: [
      {
        id: optionId,
        position: 0,
        sentenceVersionId: sentenceId,
        span: null,
        displayText: 'สวัสดี',
        sentence,
      },
    ],
    correctOptionId: optionId,
    createdAt: '2026-07-25T00:00:00.000Z',
    publishedAt: status === 'PUBLISHED' ? '2026-07-25T00:00:00.000Z' : null,
  } as const;
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '버전을 변경할 수 없습니다.',
      status,
      code: 'QUESTION_VERSION_IMMUTABLE',
      requestId: 'request-version',
      fieldErrors: [],
    },
  });
}

function createValidPayload() {
  const sentence = {
    originalText: 'สวัสดี',
    translationKo: '안녕하세요',
    pronunciationKo: '싸왓디',
    toneMarks: '',
    mediaAssetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    tokens: [],
    expressions: [],
  };
  return {
    questionTypeSlug: 'dialogue-choice',
    questionTypeVersion: 1,
    difficulty: 4,
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        sentences: [{ speaker: null, sentence }],
      },
    ],
    options: [{ clientRef: 'option-1', position: 0, sentence }],
    correctOptionRef: 'option-1',
  };
}

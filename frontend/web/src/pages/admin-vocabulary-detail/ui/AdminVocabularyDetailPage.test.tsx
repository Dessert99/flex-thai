/** 관리자 어휘 상세의 음성 readiness·form 검증·409를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { AdminVocabularyDetailPageContainer } from './AdminVocabularyDetailPageContainer';

const vocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue(createDetail());
});

describe('관리자 어휘 상세', () => {
  it('발음 음성 readiness와 사용처를 표시한다', async () => {
    renderDetail();
    expect(await screen.findByText('음성 준비 완료')).toBeInTheDocument();
    expect(screen.getByText('문장 버전 사용처 1개')).toBeInTheDocument();
    expect(screen.getByText('RELATED · PENDING')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '병합 미리보기' }),
    ).toBeInTheDocument();
  });

  it('schema field 오류에는 교체 요청을 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderDetail();
    const thai = await screen.findByLabelText('태국어 표기');
    await user.clear(thai);
    await user.click(screen.getByRole('button', { name: '어휘 전체 교체' }));
    expect(
      await screen.findByText('태국어 표기를 입력해 주세요.'),
    ).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledOnce();
  });

  it('게시 prerequisite 409를 서버 확인 결과로 표시한다', async () => {
    mocks.authenticatedRequest
      .mockResolvedValueOnce(createDetail())
      .mockRejectedValueOnce(createProblemError(409));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: '어휘 게시' }));
    await user.click(screen.getByRole('button', { name: '게시 확인' }));
    expect(
      await screen.findByText('현재 상태에서는 이 작업을 수행할 수 없습니다.'),
    ).toBeInTheDocument();
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminVocabularyDetailPageContainer vocabularyId={vocabularyId} />,
  );
}

function createDetail() {
  return {
    id: vocabularyId,
    thai: 'สวัสดี',
    kind: 'WORD',
    status: 'DRAFT',
    mergedIntoVocabularyId: null,
    meanings: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        meaningKo: '안녕하세요',
        partOfSpeech: '감탄사',
        difficulty: null,
        contextNote: null,
      },
    ],
    pronunciations: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        pronunciationKo: '싸왓디',
        toneMarks: '',
        mediaAssetId: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
        mediaStatus: 'READY',
      },
    ],
    meaningPronunciations: [
      {
        meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
      },
    ],
    relations: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aaf',
        sourceMeaningId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        targetMeaningId: '01933b6a-8f13-7a19-b7e5-536d70f57ab0',
        type: 'RELATED',
        direction: 'DIRECTED',
        status: 'PENDING',
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
      },
    ],
    usage: {
      sentenceVersionIds: ['01933b6a-8f13-7a19-b7e5-536d70f57aae'],
      questionVersionIds: [],
    },
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  };
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '게시할 수 없습니다.',
      status,
      code: 'VOCABULARY_NOT_READY',
      requestId: 'request-vocabulary',
      fieldErrors: [],
    },
  });
}

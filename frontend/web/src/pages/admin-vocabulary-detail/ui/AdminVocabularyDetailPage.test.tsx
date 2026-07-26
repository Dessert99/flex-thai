/** 관리자 어휘 상세의 음성 readiness·form 검증·409를 검증한다 */
import type {
  AdminVocabularyDetailResponse,
  AdminVocabularyMergePreviewResponse,
} from '@flex-thia/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import {
  vocabularyMergeInvalidationKeys,
  vocabularyRelationInvalidationKeys,
} from '../model/useAdminVocabularyDetailActions';
import { AdminVocabularyDetailPageContainer } from './AdminVocabularyDetailPageContainer';
import { VocabularyMergePanel } from './VocabularyMergePanel';
import { VocabularyRelationManager } from './VocabularyRelationManager';
import { VocabularyRelationRow } from './VocabularyRelationRow';

const vocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const representativeVocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57abb';
const relationId = '01933b6a-8f13-7a19-b7e5-536d70f57aaf';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue(createDetail());
});

describe('관리자 어휘 상세', () => {
  it('발음 음성 readiness와 사용처를 표시한다', async () => {
    renderDetail();
    expect(await screen.findByText('음성 준비 완료')).toBeInTheDocument();
    expect(screen.getByText('문장 버전 사용처 1개')).toBeInTheDocument();
    expect(screen.getByText(/PENDING/u)).toBeInTheDocument();
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

describe('관리자 어휘 관계 control', () => {
  it('terminal 관계는 반대 terminal 직행 대신 PENDING 재검토만 제공한다', () => {
    const onUpdate = vi.fn();
    render(
      <VocabularyRelationRow
        disabled={false}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
        relation={firstRelation('PASSED')}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '재검토 요청' }));

    expect(
      screen.queryByRole('button', { name: '검증 실패' }),
    ).not.toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledWith(relationId, { status: 'PENDING' });
  });

  it('뜻·종류·방향을 선택해 관계를 생성하고 기존 메타데이터도 수정한다', async () => {
    const onCreate = vi.fn();
    const onUpdate = vi.fn();
    render(
      <VocabularyRelationManager
        detail={createDetail()}
        disabled={false}
        onCreate={onCreate}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.change(screen.getByLabelText('연결할 뜻 UUID'), {
      target: { value: representativeVocabularyId },
    });
    await chooseSelect('관계 종류', '동의어');
    await chooseSelect('관계 방향', '양방향');
    fireEvent.click(screen.getByRole('button', { name: '관계 추가' }));
    await chooseSelect(`관계 ${relationId} 종류`, '반의어');
    fireEvent.click(screen.getByRole('button', { name: '메타데이터 저장' }));

    expect(onCreate).toHaveBeenCalledWith({
      sourceMeaningId: firstMeaningId(),
      targetMeaningId: representativeVocabularyId,
      type: 'SYNONYM',
      direction: 'BIDIRECTIONAL',
    });
    expect(onUpdate).toHaveBeenCalledWith(
      relationId,
      expect.objectContaining({ type: 'ANTONYM' }),
    );
  });
});

describe('관리자 어휘 병합 control', () => {
  it('대표 입력이 바뀌면 preview를 폐기하고 source·대표가 일치할 때만 병합한다', () => {
    const onRepresentativeChange = vi.fn();
    render(
      <VocabularyMergePanel
        disabled={false}
        onMerge={vi.fn()}
        onPreview={vi.fn()}
        onRepresentativeChange={onRepresentativeChange}
        preview={createMergePreview()}
        sourceVocabularyId={vocabularyId}
      />,
    );
    expect(
      screen.getByRole('button', { name: '이 상태로 병합' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/source สวัสดี/u)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('대표 어휘 UUID'), {
      target: { value: `${representativeVocabularyId}0` },
    });

    expect(onRepresentativeChange).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: '이 상태로 병합' }),
    ).not.toBeInTheDocument();
  });

  it('관계·병합 성공 뒤 상대 상세와 학습자·단어장 cache key를 포함한다', () => {
    expect(vocabularyRelationInvalidationKeys).toContainEqual([
      'admin',
      'vocabularies',
      'detail',
    ]);
    expect(vocabularyRelationInvalidationKeys).toContainEqual([
      'learner',
      'vocabularies',
    ]);
    expect(
      vocabularyMergeInvalidationKeys(vocabularyId, representativeVocabularyId),
    ).toEqual(
      expect.arrayContaining([
        ['admin', 'vocabularies', 'detail', representativeVocabularyId],
        ['admin', 'home', 'vocabularies'],
        ['learner', 'vocabularies'],
        ['learner', 'home', 'vocabularies'],
        ['learner', 'vocabulary'],
        ['learner', 'wordbooks'],
      ]),
    );
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminVocabularyDetailPageContainer vocabularyId={vocabularyId} />,
  );
}

async function chooseSelect(label: string, option: string) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

function firstRelation(status: 'PENDING' | 'PASSED' = 'PENDING') {
  const relation = createDetail(status).relations[0];
  if (!relation) throw new Error('관계 fixture가 필요합니다');
  return relation;
}

function firstMeaningId() {
  const meaning = createDetail().meanings[0];
  if (!meaning) throw new Error('뜻 fixture가 필요합니다');
  return meaning.id;
}

function createDetail(
  relationStatus: 'PENDING' | 'PASSED' = 'PENDING',
): AdminVocabularyDetailResponse {
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
        id: relationId,
        sourceMeaningId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        targetMeaningId: '01933b6a-8f13-7a19-b7e5-536d70f57ab0',
        type: 'RELATED',
        direction: 'DIRECTED',
        status: relationStatus,
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

function createMergePreview(): AdminVocabularyMergePreviewResponse {
  const usage = {
    tokenOccurrences: 0,
    expressionOccurrences: 0,
    savedMemberships: 0,
    wordbookMemberships: 0,
    practiceQuestions: 0,
  };
  return {
    source: {
      id: vocabularyId,
      thai: 'สวัสดี',
      normalizedThai: 'สวัสดี',
      kind: 'WORD',
      status: 'DRAFT',
      meaningCount: 1,
      pronunciationCount: 1,
      usage,
    },
    representative: {
      id: representativeVocabularyId,
      thai: 'หวัดดี',
      normalizedThai: 'หวัดดี',
      kind: 'WORD',
      status: 'PUBLISHED',
      meaningCount: 1,
      pronunciationCount: 1,
      usage,
    },
    comparison: { normalizedEqual: false, codePointDistance: 2 },
    mergeToken: 'a'.repeat(43),
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

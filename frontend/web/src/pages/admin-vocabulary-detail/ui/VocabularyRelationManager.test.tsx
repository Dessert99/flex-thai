/** 관리자 관계 생성이 최신 상세의 뜻만 사용하는지 검증한다 */
import type { AdminVocabularyDetailResponse } from '@flex-thia/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VocabularyRelationManager } from './VocabularyRelationManager';

const originalMeaningId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';
const replacementMeaningId = '01933b6a-8f13-7a19-b7e5-536d70f57ac0';
const targetMeaningId = '01933b6a-8f13-7a19-b7e5-536d70f57abb';

describe('관리자 어휘 관계 생성', () => {
  it('상세 뜻이 교체되면 새 첫 뜻을 기준으로 관계를 생성한다', () => {
    const onCreate = vi.fn();
    const props = {
      disabled: false,
      onCreate,
      onDelete: vi.fn(),
      onUpdate: vi.fn(),
    };
    const { rerender } = render(
      <VocabularyRelationManager
        {...props}
        detail={createDetail(originalMeaningId)}
      />,
    );

    rerender(
      <VocabularyRelationManager
        {...props}
        detail={createDetail(replacementMeaningId)}
      />,
    );
    fireEvent.change(screen.getByLabelText('연결할 뜻 UUID'), {
      target: { value: targetMeaningId },
    });
    fireEvent.click(screen.getByRole('button', { name: '관계 추가' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMeaningId: replacementMeaningId }),
    );
  });

  it('상세에 뜻이 없으면 관계 생성을 비활성화한다', () => {
    render(
      <VocabularyRelationManager
        detail={createDetail()}
        disabled={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '관계 추가' })).toBeDisabled();
  });
});

function createDetail(meaningId?: string): AdminVocabularyDetailResponse {
  return {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    thai: 'สวัสดี',
    kind: 'WORD',
    status: 'DRAFT',
    mergedIntoVocabularyId: null,
    meanings: meaningId
      ? [
          {
            id: meaningId,
            meaningKo: '안녕하세요',
            partOfSpeech: '감탄사',
            difficulty: null,
            contextNote: null,
          },
        ]
      : [],
    pronunciations: [],
    meaningPronunciations: [],
    relations: [],
    usage: { sentenceVersionIds: [], questionVersionIds: [] },
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  };
}

/** 콘텐츠 제작 preset form의 typed version 복제를 검증한다 */
/* eslint-disable max-lines-per-function */
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionPresetForm } from './ContentProductionPresetForm';

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '어휘',
  version: 1,
  purpose: 'VOCABULARY_EXTRACTION',
  parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
  enabled: true,
  revision: 2,
  createdAt: '2026-07-28T00:00:00.000Z',
} satisfies ContentProductionPresetVersion;

describe('ContentProductionPresetForm', () => {
  it('기존 parameter를 직접 수정하지 않고 다음 version 값을 전달한다', () => {
    const onCreateVersion = vi.fn();
    render(
      <ContentProductionPresetForm
        base={base}
        onCreate={vi.fn()}
        onCreateVersion={onCreateVersion}
      />,
    );
    fireEvent.change(screen.getByLabelText('중복 의심 최대 코드 포인트 거리'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: '새 버전 만들기' }));
    expect(onCreateVersion).toHaveBeenCalledWith(base.id, base.purpose, {
      suspectedDuplicateMaxCodePointDistance: 3,
    });
    expect(base.parameters.suspectedDuplicateMaxCodePointDistance).toBe(1);
    expect(
      screen.queryByRole('textbox', { name: /JSON/u }),
    ).not.toBeInTheDocument();
  });

  it('복합 preset의 다음 version에서 어휘와 문제 정책 변경을 모두 보존한다', () => {
    const onCreateVersion = vi.fn();
    const combined = {
      ...base,
      purpose: 'VOCABULARY_THEN_QUESTION_GENERATION' as const,
      parameters: {
        suspectedDuplicateMaxCodePointDistance: 1,
        questionCount: 1,
        questionTypePlan: [
          {
            questionTypeVersionId: '00000000-0000-4000-8000-000000000011',
            count: 1,
          },
        ],
        difficultyPlan: [{ difficulty: 2 as const, count: 1 }],
        targetVocabularyIds: [],
        requiredVocabularyIds: [],
        excludedVocabularyIds: [],
        newAuxiliaryVocabularyLimit: 2,
        similarityThreshold: 0.7,
        defaultVoicePresetId: '00000000-0000-4000-8000-000000000012',
        speakerVoiceAssignments: [],
        additionalInstructionKo: null,
        commonPrinciples: [],
        similarQuestions: [],
      },
    } satisfies ContentProductionPresetVersion;
    render(
      <ContentProductionPresetForm
        base={combined}
        onCreate={vi.fn()}
        onCreateVersion={onCreateVersion}
      />,
    );
    fireEvent.change(screen.getByLabelText('중복 의심 최대 코드 포인트 거리'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('유사도 기준'), {
      target: { value: '0.85' },
    });
    fireEvent.change(screen.getByLabelText('신규 보조 어휘 한도'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: '새 버전 만들기' }));

    expect(onCreateVersion).toHaveBeenCalledWith(
      combined.id,
      combined.purpose,
      expect.objectContaining({
        suspectedDuplicateMaxCodePointDistance: 3,
        similarityThreshold: 0.85,
        newAuxiliaryVocabularyLimit: 5,
      }),
    );
  });

  it('신규 문제 생성 preset을 typed purpose와 parameters로 만든다', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onCreate = vi.fn();
    render(
      <ContentProductionPresetForm
        onCreate={onCreate}
        onCreateVersion={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('이름'), {
      target: { value: '문제 생성' },
    });
    fireEvent.keyDown(screen.getByLabelText('목적'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: '문제 생성' }));
    fireEvent.change(screen.getByLabelText('문제 유형 버전 ID'), {
      target: { value: '00000000-0000-4000-8000-000000000011' },
    });
    fireEvent.change(screen.getByLabelText('기본 음성 preset ID'), {
      target: { value: '00000000-0000-4000-8000-000000000012' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preset 만들기' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '문제 생성',
        purpose: 'QUESTION_GENERATION',
        // Vitest asymmetric matcher는 runtime parameters의 부분 일치만 검증한다.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        parameters: expect.objectContaining({
          questionCount: 1,
          similarityThreshold: 0.8,
        }),
      }),
    );
  });
});

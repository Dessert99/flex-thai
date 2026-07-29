/** 콘텐츠 제작 form의 verified upload와 prompt read-only 경계를 검증한다 */
/* eslint-disable max-lines-per-function */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionForm } from './ContentProductionForm';

const preset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '어휘 추출',
  version: 1,
  purpose: 'VOCABULARY_EXTRACTION' as const,
  parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
};

const questionPreset = {
  id: '00000000-0000-4000-8000-000000000010',
  name: '문제 생성',
  version: 1,
  purpose: 'QUESTION_GENERATION' as const,
  parameters: {
    questionCount: 1,
    questionTypePlan: [
      {
        questionTypeVersionId: '00000000-0000-4000-8000-000000000011',
        count: 1,
      },
    ],
    difficultyPlan: [{ difficulty: 2 as const, count: 1 }],
    targetVocabularyIds: ['00000000-0000-4000-8000-000000000012'],
    requiredVocabularyIds: [],
    excludedVocabularyIds: [],
    newAuxiliaryVocabularyLimit: 3,
    similarityThreshold: 0.7,
    defaultVoicePresetId: '00000000-0000-4000-8000-000000000013',
    speakerVoiceAssignments: [
      {
        speakerRole: '진행자',
        voicePresetId: '00000000-0000-4000-8000-000000000014',
      },
    ],
    additionalInstructionKo: null,
    commonPrinciples: [],
    similarQuestions: [],
  },
};

describe('ContentProductionForm', () => {
  it('업로드 검증 전에는 실행을 막고 검증 뒤 uploadId를 전달한다', async () => {
    const onSubmit = vi.fn();
    render(
      <ContentProductionForm
        onFile={vi.fn().mockResolvedValue({
          uploadId: '00000000-0000-4000-8000-000000000002',
          inputType: 'TEXT',
          sizeBytes: 3,
          status: 'VERIFIED',
        })}
        onPreview={vi.fn()}
        onSubmit={onSubmit}
        presets={[preset]}
      />,
    );
    const submit = screen.getByRole('button', { name: '작업 실행' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('입력 파일'), {
      target: {
        files: [new File(['abc'], 'input.txt', { type: 'text/plain' })],
      },
    });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      options: null,
      presetId: preset.id,
      uploadId: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('생성 prompt는 수정할 수 없는 field로 표시한다', () => {
    render(
      <ContentProductionForm
        onFile={vi.fn()}
        onPreview={vi.fn()}
        onSubmit={vi.fn()}
        presets={[preset]}
        preview={{
          promptVersion: 'v1',
          questionPlanIndex: 0,
          sections: [],
          prompt: 'immutable prompt',
        }}
      />,
    );
    expect(screen.getByLabelText('생성 prompt')).toHaveAttribute('readonly');
  });

  it('고급 설정에서 모든 문제 생성 option을 typed field로 수정해 미리본다', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(
      <ContentProductionForm
        onFile={vi.fn()}
        onPreview={onPreview}
        onSubmit={vi.fn()}
        presets={[questionPreset]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: '고급 설정' }));
    for (const label of [
      '문항 수',
      '문제 유형 버전 1',
      '문제 유형 수 1',
      '난이도 1',
      '난이도 수 1',
      '대상 어휘 IDs',
      '필수 어휘 IDs',
      '제외 어휘 IDs',
      '신규 보조 어휘 한도',
      '유사도 기준',
      '기본 음성 preset ID',
      'speaker role 1',
      'speaker 음성 preset ID 1',
      '추가 지시',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText('신규 보조 어휘 한도'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('유사도 기준'), {
      target: { value: '0.85' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prompt 미리보기' }));

    expect(onPreview).toHaveBeenCalledWith({
      presetId: questionPreset.id,
      questionPlanIndex: 0,
      // Vitest asymmetric matcher는 runtime options의 부분 일치만 검증한다.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      options: expect.objectContaining({
        questionCount: 1,
        newAuxiliaryVocabularyLimit: 5,
        similarityThreshold: 0.85,
        targetVocabularyIds: ['00000000-0000-4000-8000-000000000012'],
        speakerVoiceAssignments: [
          {
            speakerRole: '진행자',
            voicePresetId: '00000000-0000-4000-8000-000000000014',
          },
        ],
      }),
    });
  });
});

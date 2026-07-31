/** 콘텐츠 제작 form의 verified upload와 prompt read-only 경계를 검증한다 */
/* eslint-disable max-lines-per-function */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
    questionCount: 2,
    questionTypePlan: [
      {
        questionTypeVersionId: '00000000-0000-4000-8000-000000000011',
        count: 1,
      },
      {
        questionTypeVersionId: '00000000-0000-4000-8000-000000000015',
        count: 1,
      },
    ],
    difficultyPlan: [
      { difficulty: 2 as const, count: 1 },
      { difficulty: 3 as const, count: 1 },
    ],
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
      {
        speakerRole: '응시자',
        voicePresetId: '00000000-0000-4000-8000-000000000016',
      },
    ],
    additionalInstructionKo: null,
    commonPrinciples: [],
    similarQuestions: [],
  },
};

describe('콘텐츠 제작 form', () => {
  it('업로드 검증 전에는 실행을 막고 검증 뒤 uploadId를 전달한다', async () => {
    const onSubmit = vi.fn();
    render(
      <ContentProductionForm
        onConfigurationChange={vi.fn()}
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
        onConfigurationChange={vi.fn()}
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

  it('고급 옵션이 바뀌면 이전 설정으로 만든 prompt를 숨긴다', async () => {
    function PreviewParityFixture() {
      const [preview, setPreview] = useState<
        Parameters<typeof ContentProductionForm>[0]['preview']
      >({
        promptVersion: 'v1',
        questionPlanIndex: 0,
        sections: [],
        prompt: '이전 설정 prompt',
      });
      return (
        <ContentProductionForm
          onConfigurationChange={() => setPreview(undefined)}
          onFile={vi.fn()}
          onPreview={vi.fn()}
          onSubmit={vi.fn()}
          presets={[questionPreset]}
          {...(preview ? { preview } : {})}
        />
      );
    }
    const user = userEvent.setup();
    render(<PreviewParityFixture />);
    expect(screen.getByDisplayValue('이전 설정 prompt')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: '고급 설정' }));
    fireEvent.change(screen.getByLabelText('신규 보조 어휘 한도'), {
      target: { value: '5' },
    });

    expect(screen.queryByLabelText('생성 prompt')).not.toBeInTheDocument();
  });

  it('미리보기 항목과 preset 변경을 알리고 현재 계획만 요청한다', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const onConfigurationChange = vi.fn();
    const onPreview = vi.fn();
    render(
      <ContentProductionForm
        onConfigurationChange={onConfigurationChange}
        onFile={vi.fn()}
        onPreview={onPreview}
        onSubmit={vi.fn()}
        presets={[questionPreset, preset]}
      />,
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: '미리보기 항목' }), {
      key: 'Enter',
    });
    fireEvent.click(screen.getByRole('option', { name: '2번' }));
    await user.click(screen.getByRole('button', { name: 'Prompt 미리보기' }));
    const previewInput: unknown = onPreview.mock.calls[0]?.[0];
    expect(previewInput).toMatchObject({ questionPlanIndex: 1 });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Preset' }), {
      key: 'Enter',
    });
    fireEvent.click(screen.getByRole('option', { name: '어휘 추출 v1' }));
    expect(
      screen.getByRole('button', { name: 'Prompt 미리보기' }),
    ).toBeDisabled();
    expect(onConfigurationChange).toHaveBeenCalledTimes(2);
  });

  it('고급 설정에서 모든 문제 생성 option을 typed field로 수정해 미리본다', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(
      <ContentProductionForm
        onConfigurationChange={vi.fn()}
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
    fireEvent.change(screen.getByLabelText('문항 수'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('문제 유형 버전 1'), {
      target: { value: '00000000-0000-4000-8000-000000000021' },
    });
    fireEvent.change(screen.getByLabelText('문제 유형 수 1'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('난이도 1'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('난이도 수 1'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('대상 어휘 IDs'), {
      target: {
        value:
          '00000000-0000-4000-8000-000000000022, , 00000000-0000-4000-8000-000000000023',
      },
    });
    fireEvent.change(screen.getByLabelText('필수 어휘 IDs'), {
      target: { value: '00000000-0000-4000-8000-000000000024' },
    });
    fireEvent.change(screen.getByLabelText('제외 어휘 IDs'), {
      target: { value: '00000000-0000-4000-8000-000000000025' },
    });
    fireEvent.change(screen.getByLabelText('유사도 기준'), {
      target: { value: '0.85' },
    });
    fireEvent.change(screen.getByLabelText('기본 음성 preset ID'), {
      target: { value: '00000000-0000-4000-8000-000000000026' },
    });
    fireEvent.change(screen.getByLabelText('speaker role 1'), {
      target: { value: '해설자' },
    });
    fireEvent.change(screen.getByLabelText('speaker 음성 preset ID 1'), {
      target: { value: '00000000-0000-4000-8000-000000000027' },
    });
    fireEvent.change(screen.getByLabelText('추가 지시'), {
      target: { value: '   ' },
    });
    fireEvent.change(screen.getByLabelText('추가 지시'), {
      target: { value: '  문법 함정을 포함해 주세요.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prompt 미리보기' }));

    const previewInput: unknown = onPreview.mock.calls[0]?.[0];
    expect(previewInput).toEqual({
      presetId: questionPreset.id,
      questionPlanIndex: 0,
      options: {
        questionCount: 2,
        questionTypePlan: [
          {
            questionTypeVersionId: '00000000-0000-4000-8000-000000000021',
            count: 1,
          },
          {
            questionTypeVersionId: '00000000-0000-4000-8000-000000000015',
            count: 1,
          },
        ],
        difficultyPlan: [
          { difficulty: 4, count: 1 },
          { difficulty: 3, count: 1 },
        ],
        newAuxiliaryVocabularyLimit: 5,
        similarityThreshold: 0.85,
        targetVocabularyIds: [
          '00000000-0000-4000-8000-000000000022',
          '00000000-0000-4000-8000-000000000023',
        ],
        requiredVocabularyIds: ['00000000-0000-4000-8000-000000000024'],
        excludedVocabularyIds: ['00000000-0000-4000-8000-000000000025'],
        defaultVoicePresetId: '00000000-0000-4000-8000-000000000026',
        speakerVoiceAssignments: [
          {
            speakerRole: '해설자',
            voicePresetId: '00000000-0000-4000-8000-000000000027',
          },
          {
            speakerRole: '응시자',
            voicePresetId: '00000000-0000-4000-8000-000000000016',
          },
        ],
        additionalInstructionKo: '문법 함정을 포함해 주세요.',
      },
    });
  });
});

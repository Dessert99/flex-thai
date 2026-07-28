/** 콘텐츠 제작 form의 verified upload와 prompt read-only 경계를 검증한다 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionForm } from './ContentProductionForm';

const preset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '어휘 추출',
  version: 1,
  purpose: 'VOCABULARY_EXTRACTION' as const,
  parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
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
      presetId: preset.id,
      uploadId: '00000000-0000-4000-8000-000000000002',
      additionalInstructionKo: null,
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
});

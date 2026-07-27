/** 문제 유형과 다음 버전 생성 form의 실제 입력·제출 흐름을 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CreateQuestionTypeForm,
  CreateQuestionTypeVersionForm,
} from './QuestionTypeForms';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('세부 문제 유형 생성 form', () => {
  it('slug와 이름, FLEX 대분류를 입력해 세부 유형을 생성한다', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<CreateQuestionTypeForm onCreate={onCreate} />);

    await user.type(screen.getByLabelText('세부 유형 slug'), 'dialogue-detail');
    await user.type(screen.getByLabelText('세부 유형 이름'), '대화 세부');
    screen.getByRole('combobox', { name: 'FLEX 대분류' }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: '대화문' }));
    await user.click(screen.getByRole('button', { name: '세부 유형 만들기' }));

    expect(onCreate).toHaveBeenCalledWith({
      slug: 'dialogue-detail',
      displayName: '대화 세부',
      majorCategory: 'LISTENING_DIALOGUE',
    });
  });
});

describe('다음 문제 유형 버전 생성 form', () => {
  it('유효하지 않은 판정 규칙 JSON은 생성하지 않는다', () => {
    const onCreate = vi.fn();
    render(
      <CreateQuestionTypeVersionForm
        initial={{
          id: '00000000-0000-4000-8000-000000000002',
          version: 1,
          status: 'DRAFT',
          template: 'STANDARD_CHOICE',
          optionCount: 4,
          decisionRules: {},
          difficultyCriteria: [],
          approvedExamples: [],
        }}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(
      screen.getByRole('textbox', { name: 'vNext 판정 규칙 JSON' }),
      { target: { value: '{' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'vNext DRAFT 만들기' }));

    expect(onCreate).not.toHaveBeenCalled();
  });
});

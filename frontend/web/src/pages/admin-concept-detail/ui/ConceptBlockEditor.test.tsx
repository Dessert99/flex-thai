/** 개념 block editor의 종류별 입력·삭제·정렬 분기를 검증한다 */
/* eslint-disable max-lines */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptBlockEditor } from './ConceptBlockEditor';

describe('ConceptBlockEditor 설명 block', () => {
  it('제목과 문단을 수정하고 여러 문단 중 하나를 삭제한다', () => {
    const onChange = vi.fn();
    render(
      <ConceptBlockEditor
        blocks={[
          {
            kind: 'EXPLANATION',
            position: 0,
            heading: '설명',
            paragraphs: ['첫 문단', '둘째 문단'],
          },
        ]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('블록 1 제목'), {
      target: { value: '핵심 설명' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ heading: '핵심 설명' }),
    ]);
    fireEvent.change(screen.getByLabelText('블록 1 문단 2'), {
      target: { value: '고친 문단' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ paragraphs: ['첫 문단', '고친 문단'] }),
    ]);
    fireEvent.click(getButtonAt('문단 삭제', 0));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ paragraphs: ['둘째 문단'] }),
    ]);
  });

  it('block을 위로 이동하거나 삭제할 때 position을 다시 매긴다', () => {
    const onChange = vi.fn();
    render(
      <ConceptBlockEditor
        blocks={[
          {
            kind: 'EXPLANATION',
            position: 0,
            heading: '첫째',
            paragraphs: ['본문'],
          },
          {
            kind: 'EXPLANATION',
            position: 1,
            heading: '둘째',
            paragraphs: ['본문'],
          },
        ]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(getButtonAt('위로', 1));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ heading: '둘째', position: 0 }),
      expect.objectContaining({ heading: '첫째', position: 1 }),
    ]);
    fireEvent.click(getButtonAt('블록 삭제', 0));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ heading: '둘째', position: 0 }),
    ]);
  });
});

describe('ConceptBlockEditor 규칙 표 block', () => {
  it('열 제목과 cell을 수정하고 열 추가·삭제로 모든 행 폭을 맞춘다', () => {
    const onChange = vi.fn();
    const block = {
      kind: 'RULE_TABLE' as const,
      position: 0,
      heading: '규칙',
      headers: ['구분', '형태'],
      rows: [['평서문', '주어+동사']],
    };
    const { rerender } = render(
      <ConceptBlockEditor
        blocks={[block]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('블록 1 열 2 제목'), {
      target: { value: '문장 형태' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ headers: ['구분', '문장 형태'] }),
    ]);
    fireEvent.change(screen.getByLabelText('블록 1 행 1 열 2'), {
      target: { value: '주어+서술어' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ rows: [['평서문', '주어+서술어']] }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: '열 추가' }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        headers: ['구분', '형태', '새 열'],
        rows: [['평서문', '주어+동사', '값']],
      }),
    ]);

    rerender(
      <ConceptBlockEditor
        blocks={[
          {
            ...block,
            headers: ['구분', '형태', '예시'],
            rows: [['평서문', '주어+동사', 'ฉันมา']],
          },
        ]}
        disabled={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '마지막 열 삭제' }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        headers: ['구분', '형태'],
        rows: [['평서문', '주어+동사']],
      }),
    ]);
  });

  it('현재 열 수로 행을 추가하고 여러 행 중 하나를 삭제한다', () => {
    const onChange = vi.fn();
    render(
      <ConceptBlockEditor
        blocks={[
          {
            kind: 'RULE_TABLE',
            position: 0,
            heading: '규칙',
            headers: ['구분', '형태'],
            rows: [
              ['평서문', '주어+동사'],
              ['의문문', '주어+동사+ไหม'],
            ],
          },
        ]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '행 추가' }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        rows: [
          ['평서문', '주어+동사'],
          ['의문문', '주어+동사+ไหม'],
          ['값', '값'],
        ],
      }),
    ]);
    fireEvent.click(getButtonAt('행 삭제', 0));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ rows: [['의문문', '주어+동사+ไหม']] }),
    ]);
  });
});

describe('ConceptBlockEditor 태국어 예시 block', () => {
  it('문장 UUID와 선택 메모를 수정하고 빈 메모를 null로 정규화한다', () => {
    const onChange = vi.fn();
    render(
      <ConceptBlockEditor
        blocks={[
          {
            kind: 'THAI_EXAMPLES',
            position: 0,
            heading: '예문',
            examples: [
              {
                position: 0,
                sentenceVersionId: '11111111-1111-4111-8111-111111111111',
                noteKo: '기존 메모',
              },
            ],
          },
        ]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('예시 1 문장 버전 UUID'), {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        examples: [
          expect.objectContaining({
            sentenceVersionId: '22222222-2222-4222-8222-222222222222',
          }),
        ],
      }),
    ]);
    fireEvent.change(screen.getByLabelText('예시 1 한국어 메모'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        examples: [expect.objectContaining({ noteKo: null })],
      }),
    ]);
  });

  it('예시를 추가하고 삭제할 때 position을 연속으로 유지한다', () => {
    const onChange = vi.fn();
    render(
      <ConceptBlockEditor
        blocks={[
          {
            kind: 'THAI_EXAMPLES',
            position: 0,
            heading: '예문',
            examples: [
              {
                position: 0,
                sentenceVersionId: '11111111-1111-4111-8111-111111111111',
                noteKo: null,
              },
              {
                position: 1,
                sentenceVersionId: '22222222-2222-4222-8222-222222222222',
                noteKo: null,
              },
            ],
          },
        ]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '예시 추가' }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        examples: [
          expect.objectContaining({ position: 0 }),
          expect.objectContaining({ position: 1 }),
          {
            position: 2,
            sentenceVersionId: '',
            noteKo: null,
          },
        ],
      }),
    ]);
    fireEvent.click(getButtonAt('예시 삭제', 0));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        examples: [
          expect.objectContaining({
            position: 0,
            sentenceVersionId: '22222222-2222-4222-8222-222222222222',
          }),
        ],
      }),
    ]);
  });
});

describe('ConceptBlockEditor block 생성', () => {
  it.each([
    {
      button: '설명 블록 추가',
      expected: {
        kind: 'EXPLANATION',
        position: 0,
        heading: '새 설명',
        paragraphs: ['새 문단'],
      },
    },
    {
      button: '규칙 표 블록 추가',
      expected: {
        kind: 'RULE_TABLE',
        position: 0,
        heading: '새 규칙 표',
        headers: ['항목'],
        rows: [['값']],
      },
    },
    {
      button: '태국어 예시 블록 추가',
      expected: {
        kind: 'THAI_EXAMPLES',
        position: 0,
        heading: '새 태국어 예시',
        examples: [{ position: 0, sentenceVersionId: '', noteKo: null }],
      },
    },
  ])('$button으로 기본 block을 추가한다', ({ button, expected }) => {
    const onChange = vi.fn();
    render(
      <ConceptBlockEditor
        blocks={[]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: button }));

    expect(onChange).toHaveBeenCalledWith([expected]);
  });

  it('편집이 비활성화되면 block 추가 action도 실행하지 않는다', () => {
    const onChange = vi.fn();
    render(
      <ConceptBlockEditor
        blocks={[]}
        disabled
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole('button', { name: '설명 블록 추가' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '설명 블록 추가' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

function getButtonAt(name: string, index: number): HTMLElement {
  const button = screen.getAllByRole('button', { name })[index];
  if (!button) throw new Error(`${name} button ${index}가 필요합니다.`);
  return button;
}

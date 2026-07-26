/** 관리자 개념 상세의 초안·검증·게시 동작을 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminConceptDetailPageView } from './AdminConceptDetailPageView';
import { ConceptBlockEditor } from './ConceptBlockEditor';

describe('AdminConceptDetailPageView', () => {
  it('검증 문제를 표시하고 PASSED 초안만 게시할 수 있다', () => {
    const onPublish = vi.fn();
    render(
      <AdminConceptDetailPageView
        blocks={[{
          kind: 'EXPLANATION',
          position: 0,
          heading: '설명',
          paragraphs: ['본문'],
        }]}
        conflict
        data={{
          id: '11111111-1111-4111-8111-111111111111',
          status: 'DRAFT',
          currentPublishedVersionId: null,
          versions: [{
            id: '22222222-2222-4222-8222-222222222222',
            conceptId: '11111111-1111-4111-8111-111111111111',
            version: 1,
            revision: 2,
            category: 'GRAMMAR',
            position: 0,
            title: '기본 어순',
            summary: '요약',
            status: 'DRAFT',
            validationStatus: 'FAILED',
            validationIssues: [{
              source: 'REFERENCE',
              path: 'blocks.0.examples.0',
              code: 'CONCEPT_AUDIO_NOT_READY',
              evidenceKo: '문장 음성이 준비되지 않았습니다.',
            }],
            validatedAt: '2026-07-26T00:00:00.000Z',
            publishedAt: null,
            blocks: [{
              kind: 'EXPLANATION',
              position: 0,
              heading: '설명',
              paragraphs: ['본문'],
            }],
          }],
        }}
        draftMetadata={{
          category: 'GRAMMAR',
          position: 0,
          title: '기본 어순',
          summary: '요약',
        }}
        error={false}
        loading={false}
        message={null}
        onBlocksChange={vi.fn()}
        onCreateDraft={vi.fn()}
        onPublish={onPublish}
        onRetry={vi.fn()}
        onMetadataChange={vi.fn()}
        onSave={vi.fn()}
        onValidate={vi.fn()}
        onVisibilityChange={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('최신 상태');
    expect(screen.getByText(/CONCEPT_AUDIO_NOT_READY/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '게시' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('제목')).toHaveValue('기본 어순');
    fireEvent.click(screen.getByRole('button', { name: '검증' }));
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('게시 버전은 편집기 없이 새 초안 action만 제공한다', () => {
    render(
      <AdminConceptDetailPageView
        blocks={[]}
        conflict={false}
        data={{
          id: '11111111-1111-4111-8111-111111111111',
          status: 'PUBLISHED',
          currentPublishedVersionId: '22222222-2222-4222-8222-222222222222',
          versions: [{
            id: '22222222-2222-4222-8222-222222222222',
            conceptId: '11111111-1111-4111-8111-111111111111',
            version: 1,
            revision: 0,
            category: 'GRAMMAR',
            position: 0,
            title: '기본 어순',
            summary: '요약',
            status: 'PUBLISHED',
            validationStatus: 'PASSED',
            validationIssues: [],
            validatedAt: '2026-07-26T00:00:00.000Z',
            publishedAt: '2026-07-26T00:00:00.000Z',
            blocks: [],
          }],
        }}
        draftMetadata={{
          category: 'GRAMMAR',
          position: 0,
          title: '',
          summary: '',
        }}
        error={false}
        loading={false}
        message={null}
        onBlocksChange={vi.fn()}
        onCreateDraft={vi.fn()}
        onPublish={vi.fn()}
        onRetry={vi.fn()}
        onMetadataChange={vi.fn()}
        onSave={vi.fn()}
        onValidate={vi.fn()}
        onVisibilityChange={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByRole('button', { name: '새 초안 만들기' })).toBeInTheDocument();
    expect(screen.queryByText('설명 블록 추가')).not.toBeInTheDocument();
  });
});

describe('ConceptBlockEditor', () => {
  it('문단·표 행과 열·태국어 예시를 추가할 수 있다', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ConceptBlockEditor
        blocks={[{
          kind: 'EXPLANATION',
          position: 0,
          heading: '설명',
          paragraphs: ['본문'],
        }]}
        disabled={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '문단 추가' }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ paragraphs: ['본문', '새 문단'] }),
    ]);

    rerender(
      <ConceptBlockEditor
        blocks={[{
          kind: 'RULE_TABLE',
          position: 0,
          heading: '규칙',
          headers: ['항목'],
          rows: [['값']],
        }, {
          kind: 'THAI_EXAMPLES',
          position: 1,
          heading: '예문',
          examples: [{
            position: 0,
            sentenceVersionId: '11111111-1111-4111-8111-111111111111',
            noteKo: null,
          }],
        }]}
        disabled={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '열 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '행 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '예시 추가' }));
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

/** 선택한 템플릿의 전문을 복사하며 입력 화면에 자동 적용하지 않는다 */
import { useState } from 'react';
import type { ExtractionTemplate } from '@flex-thia/contracts/vocabulary-extraction/extraction-templates';
import { Button } from '@/shared/components/button';
export function ExtractionTemplateDetail({
  template,
  pending,
  onDelete,
  onClose,
}: {
  template: ExtractionTemplate;
  pending: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template.body);
      setMessage('복사했어요. 지시문 입력란에 직접 붙여 넣으세요.');
    } catch {
      setMessage('복사하지 못했어요. 아래 지시문을 선택해 직접 복사하세요.');
    }
  };
  return (
    <aside
      aria-label='템플릿 상세'
      className='flex min-w-none flex-col gap-section border-t border-default bg-surface-muted p-page md:border-t-0 md:border-l'
    >
      <div className='flex items-start justify-between gap-cluster'>
        <h3 className='font-semibold break-words'>{template.description}</h3>
        <Button
          variant='ghost'
          size='sm'
          onClick={onClose}
          aria-label='템플릿 상세 닫기'
        >
          닫기
        </Button>
      </div>
      <p className='min-h-state flex-1 text-body break-words whitespace-pre-wrap select-text'>
        {template.body}
      </p>
      <div className='flex justify-between gap-cluster'>
        <Button
          variant='outline'
          disabled={pending}
          onClick={onDelete}
        >
          {pending ? '삭제 중' : '삭제'}
        </Button>
        <Button onClick={() => void copy()}>복사</Button>
      </div>
      <p
        role='status'
        className='min-h-icon text-caption text-subtle'
      >
        {message}
      </p>
    </aside>
  );
}

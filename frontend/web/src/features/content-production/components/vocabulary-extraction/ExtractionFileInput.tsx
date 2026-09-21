/** 파일 선택과 끌어 놓기를 같은 입력 경로로 처리한다 */
import { useRef } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { Button } from '@/shared/components/button';
export function ExtractionFileInput({
  file,
  error,
  onSelect,
  onRemove,
}: {
  file: File | null;
  error: string;
  onSelect: (files: FileList | null) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type='file'
        accept='.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
        aria-label='PDF 또는 이미지 파일 선택'
        className='sr-only'
        tabIndex={-1}
        onChange={(e) => {
          onSelect(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        type='button'
        variant='outline'
        className='h-extraction-input w-full flex-col gap-cluster border-dashed bg-surface-muted whitespace-normal'
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onSelect(e.dataTransfer.files);
        }}
      >
        {file ? <FileText aria-hidden /> : <Upload aria-hidden />}
        <span className='max-w-full truncate'>
          {file ? file.name : '파일을 선택하거나 끌어 놓으세요'}
        </span>
        <span className='text-caption text-subtle'>
          {file
            ? '다른 파일로 바꾸려면 선택하세요'
            : 'PDF 또는 JPG·PNG·WebP 이미지 (이미지 최대 5MB)'}
        </span>
      </Button>
      <div className='flex h-icon items-center justify-between gap-cluster'>
        <p
          role='alert'
          className='truncate text-caption text-danger'
        >
          {error}
        </p>
        {file && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            aria-label='선택한 파일 제거'
            onClick={onRemove}
          >
            <X aria-hidden />
            제거
          </Button>
        )}
      </div>
    </>
  );
}

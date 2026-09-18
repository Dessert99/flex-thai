/** 복사용 템플릿의 설명과 본문을 입력한다 */
import { useState } from 'react';
import {
  extractionTemplateInputSchema,
  type ExtractionTemplateInput,
} from '@flex-thia/contracts/content-production/extraction-templates';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import { Textarea } from '@/shared/components/textarea';

export function ExtractionTemplateForm({
  pending,
  onSave,
  onCancel,
}: {
  pending: boolean;
  onSave: (input: ExtractionTemplateInput) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className='grid gap-section p-page'
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = extractionTemplateInputSchema.safeParse({
          description,
          body,
        });
        setInvalid(!parsed.success);
        if (parsed.success) onSave(parsed.data);
      }}
    >
      <div className='grid gap-cluster'>
        <Label htmlFor='template-description'>설명</Label>
        <Input
          id='template-description'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={120}
          required
          disabled={pending}
          placeholder='예: 기사 속 단어와 문맥상 뜻 추출'
        />
      </div>
      <div className='grid gap-cluster'>
        <Label htmlFor='template-body'>전체 지시문</Label>
        <Textarea
          id='template-body'
          className='min-h-state'
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={20000}
          required
          disabled={pending}
          placeholder='다시 사용할 지시문을 작성하세요'
        />
      </div>
      {invalid && (
        <p
          role='alert'
          className='text-caption text-danger'
        >
          설명은 한 줄로, 지시문은 빈칸 없이 입력하세요.
        </p>
      )}
      <div className='flex justify-end gap-cluster'>
        <Button
          type='button'
          variant='outline'
          disabled={pending}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button
          type='submit'
          disabled={pending}
        >
          {pending ? '저장 중' : '저장'}
        </Button>
      </div>
    </form>
  );
}

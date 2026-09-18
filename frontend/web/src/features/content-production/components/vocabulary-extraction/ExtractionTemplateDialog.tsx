/** 저장 템플릿 목록과 추가 화면, 오른쪽 전문 패널을 조합한다 */
import { Button } from '@/shared/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/dialog';
import { useExtractionTemplates } from '../../hooks/vocabulary-extraction/useExtractionTemplates';
import { ExtractionTemplateList } from './ExtractionTemplateList';
import { ExtractionTemplateForm } from './ExtractionTemplateForm';

export function ExtractionTemplateDialog({
  onClose,
  onRestoreFocus,
}: {
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const state = useExtractionTemplates();
  const { adding, setAdding, create, remove, pending, resetErrors } = state;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
        className='max-h-dialog gap-none overflow-y-auto p-none sm:max-w-4xl'
      >
        <div className='flex items-start justify-between gap-cluster border-b border-default p-page'>
          <DialogHeader>
            <DialogTitle>
              {adding ? '템플릿 추가' : '지시문 템플릿'}
            </DialogTitle>
            <DialogDescription>
              {adding
                ? '목록에는 설명만 한 줄로 표시돼요.'
                : '설명을 선택하면 오른쪽에서 전체 지시문을 볼 수 있어요.'}
            </DialogDescription>
          </DialogHeader>
          <div className='flex gap-cluster'>
            {!adding && (
              <Button
                variant='outline'
                disabled={pending}
                onClick={() => {
                  resetErrors();
                  setAdding(true);
                }}
              >
                추가
              </Button>
            )}
            <Button
              variant='ghost'
              disabled={pending}
              onClick={onClose}
            >
              닫기
            </Button>
          </div>
        </div>
        {(create.isError || remove.isError) && (
          <p
            role='alert'
            className='px-page pt-page text-caption text-danger'
          >
            {create.isError
              ? '템플릿을 저장하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.'
              : '템플릿을 삭제하지 못했어요. 다시 시도해 주세요.'}
          </p>
        )}
        {adding ? (
          <ExtractionTemplateForm
            pending={pending}
            onSave={(input) => create.mutate(input)}
            onCancel={() => {
              resetErrors();
              setAdding(false);
            }}
          />
        ) : (
          <ExtractionTemplateList state={state} />
        )}
        <p className='border-t border-default p-page text-caption text-subtle'>
          복사한 템플릿을 지시문 입력란에 직접 붙여 넣으세요.
        </p>
      </DialogContent>
    </Dialog>
  );
}

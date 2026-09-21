/** 설명 한 줄 목록에서 전문 패널을 연다 */
import { Button } from '@/shared/components/button';
import type { useExtractionTemplates } from '../../hooks/vocabulary-extraction/useExtractionTemplates';
import { ExtractionTemplateDetail } from './ExtractionTemplateDetail';
export function ExtractionTemplateList({
  state,
}: {
  state: ReturnType<typeof useExtractionTemplates>;
}) {
  const {
    selected,
    query,
    selectedId,
    pending,
    resetErrors,
    setSelectedId,
    remove,
  } = state;
  return (
    <div
      className={
        selected
          ? 'grid min-h-template-panel md:grid-cols-2'
          : 'grid min-h-template-panel'
      }
    >
      <div className='flex min-w-none flex-col gap-cluster p-page'>
        {query.isPending && (
          <p
            role='status'
            className='text-caption text-subtle'
          >
            템플릿을 불러오는 중이에요.
          </p>
        )}
        {query.isError && (
          <div role='alert'>
            <p className='mb-cluster text-caption text-danger'>
              템플릿을 불러오지 못했어요.
            </p>
            <Button
              variant='outline'
              onClick={() => void query.refetch()}
            >
              다시 시도
            </Button>
          </div>
        )}
        {query.data?.items.length === 0 && (
          <p className='text-caption text-subtle'>
            저장된 템플릿이 없어요. 새 템플릿을 추가해 보세요.
          </p>
        )}
        {query.data?.items.map((item) => (
          <Button
            key={item.id}
            variant='outline'
            aria-pressed={item.id === selectedId}
            title={item.description}
            disabled={pending}
            className='h-auto min-h-control justify-start p-cluster text-left aria-pressed:bg-surface-muted'
            onClick={() => {
              resetErrors();
              setSelectedId(item.id);
            }}
          >
            <span className='truncate'>{item.description}</span>
          </Button>
        ))}
      </div>
      {selected && (
        <ExtractionTemplateDetail
          key={selected.id}
          template={selected}
          pending={pending}
          onClose={() => setSelectedId(null)}
          onDelete={() => remove.mutate(selected.id)}
        />
      )}
    </div>
  );
}

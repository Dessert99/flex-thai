import { ConceptBlockEditor } from '@/features/learning/components/admin-concept-detail/ConceptBlockEditor';
import { useAdminConceptDetail } from '@/features/learning/hooks/admin-concept-detail/useAdminConceptDetail';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type { ConceptCategory } from '@flex-thia/contracts/concepts/concepts';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function AdminConceptDetailPage(
  pageInput: Parameters<typeof useAdminConceptDetail>[0],
) {
  const props = useAdminConceptDetail(pageInput);

  if (props.loading)
    return (
      <Container className='max-w-content flex-1'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>개념을 불러오고 있습니다.</p>
        </section>
      </Container>
    );

  if (props.error || !props.data)
    return (
      <Container className='max-w-content flex-1'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>개념을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={props.onRetry}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </Container>
    );

  const draft = props.data.versions.find(({ status }) => status === 'DRAFT');

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <h1 className='text-title text-primary'>개념 상세</h1>
        <p>상태: {props.data.status}</p>
        {props.conflict ? (
          <p role='alert'>
            다른 관리자가 수정했습니다. 최신 상태를 다시 불러왔습니다.
          </p>
        ) : null}
        {props.message ? <p role='alert'>{props.message}</p> : null}
        {draft ? (
          <article>
            <h2>초안 v{draft.version}</h2>
            <p>검증: {draft.validationStatus}</p>
            {draft.validationIssues.map((issue) => (
              <p key={`${issue.path}-${issue.code}`}>
                {issue.path} · {issue.code} · {issue.evidenceKo}
              </p>
            ))}
            <label>
              영역
              <select
                disabled={props.pending}
                onChange={(event) =>
                  props.onMetadataChange({
                    category: event.target.value as ConceptCategory,
                  })
                }
                value={props.draftMetadata.category}
              >
                <option value='THAI_SCRIPT'>태국 문자</option>
                <option value='GRAMMAR'>문법</option>
              </select>
            </label>
            <label htmlFor='concept-position'>
              교육 순서
              <Input
                disabled={props.pending}
                id='concept-position'
                min={0}
                onChange={(event) =>
                  props.onMetadataChange({
                    position: Number(event.target.value),
                  })
                }
                type='number'
                value={props.draftMetadata.position}
              />
            </label>
            <label htmlFor='concept-title'>
              제목
              <Input
                disabled={props.pending}
                id='concept-title'
                onChange={(event) =>
                  props.onMetadataChange({
                    title: event.target.value,
                  })
                }
                value={props.draftMetadata.title}
              />
            </label>
            <label htmlFor='concept-summary'>
              요약
              <Input
                disabled={props.pending}
                id='concept-summary'
                onChange={(event) =>
                  props.onMetadataChange({
                    summary: event.target.value,
                  })
                }
                value={props.draftMetadata.summary}
              />
            </label>
            <ConceptBlockEditor
              blocks={props.blocks}
              disabled={props.pending}
              onChange={props.onBlocksChange}
            />
            <Button
              disabled={props.pending}
              onClick={() => props.onSave(draft.id)}
              type='button'
            >
              저장
            </Button>
            <Button
              disabled={props.pending}
              onClick={() => props.onValidate(draft.id)}
              type='button'
            >
              검증
            </Button>
            <Button
              disabled={props.pending || draft.validationStatus !== 'PASSED'}
              onClick={() => props.onPublish(draft.id)}
              type='button'
            >
              게시
            </Button>
          </article>
        ) : (
          <Button
            disabled={props.pending}
            onClick={props.onCreateDraft}
            type='button'
          >
            새 초안 만들기
          </Button>
        )}
        {props.data.status === 'PUBLISHED' ? (
          <Button
            disabled={props.pending}
            onClick={() => props.onVisibilityChange('hide')}
            type='button'
          >
            숨기기
          </Button>
        ) : null}
        {props.data.status === 'HIDDEN' ? (
          <Button
            disabled={props.pending}
            onClick={() => props.onVisibilityChange('restore')}
            type='button'
          >
            복구
          </Button>
        ) : null}
        <section>
          <h2>버전 이력</h2>
          {props.data.versions
            .filter(({ status }) => status !== 'DRAFT')
            .map((version) => (
              <article key={version.id}>
                <h3>
                  v{version.version} · {version.status}
                </h3>
                <p>{version.title}</p>
              </article>
            ))}
        </section>
      </section>
    </Container>
  );
}

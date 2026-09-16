/** 콘텐츠 제작 form과 최근 job의 독립 상태를 표현한다 */
import { Link } from '@tanstack/react-router';
import type {
  ContentProductionJobListResponse,
  ContentProductionPresetListResponse,
  PromptPreviewResponse,
} from '@flex-thia/contracts';
import { ContentProductionForm } from '@/features/run-content-production';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

interface ContentProductionConsolePageViewProps {
  createError: boolean;
  jobs?: ContentProductionJobListResponse;
  jobsError: boolean;
  jobsLoading: boolean;
  presets?: ContentProductionPresetListResponse;
  presetsError: boolean;
  presetsLoading: boolean;
  preview?: PromptPreviewResponse;
  previewError: boolean;
  mutationPending: boolean;
  onConfigurationChange: () => void;
  onFile: Parameters<typeof ContentProductionForm>[0]['onFile'];
  onPreview: Parameters<typeof ContentProductionForm>[0]['onPreview'];
  onSubmit: Parameters<typeof ContentProductionForm>[0]['onSubmit'];
  onRetryJobs: () => void;
  onRetryPresets: () => void;
}

function ContentProductionMutationErrors({
  createError,
  previewError,
}: Pick<
  ContentProductionConsolePageViewProps,
  'createError' | 'previewError'
>) {
  return (
    <>
      {previewError ? (
        <p
          className='text-body text-danger'
          role='alert'
        >
          Prompt 미리보기를 만들지 못했습니다.
        </p>
      ) : null}
      {createError ? (
        <p
          className='text-body text-danger'
          role='alert'
        >
          콘텐츠 제작 작업을 만들지 못했습니다.
        </p>
      ) : null}
    </>
  );
}

/** preset과 job query 하나의 실패가 다른 영역을 가리지 않게 렌더링한다 */
export function ContentProductionConsolePageView(
  props: ContentProductionConsolePageViewProps,
) {
  return (
    <section className='grid gap-section'>
      <header>
        <h1 className='text-title text-primary'>콘텐츠 제작</h1>
        <p className='text-body text-subtle'>
          Prompt를 확인하고 immutable snapshot 작업을 실행합니다.
        </p>
      </header>
      {props.presetsLoading ? (
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>Preset을 불러오고 있습니다.</p>
        </section>
      ) : null}
      {props.presetsError ? (
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>Preset을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={props.onRetryPresets}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {props.presets ? (
        <>
          <ContentProductionMutationErrors
            createError={props.createError}
            previewError={props.previewError}
          />
          <ContentProductionForm
            onConfigurationChange={props.onConfigurationChange}
            onFile={props.onFile}
            onPreview={props.onPreview}
            onSubmit={props.onSubmit}
            pending={props.mutationPending}
            presets={props.presets.items}
            {...(props.preview ? { preview: props.preview } : {})}
          />
        </>
      ) : null}
      <section className='grid gap-cluster'>
        <h2 className='text-title text-primary'>최근 작업</h2>
        {props.jobsLoading ? (
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>작업을 불러오고 있습니다.</p>
          </section>
        ) : null}
        {props.jobsError ? (
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>작업을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={props.onRetryJobs}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {props.jobs?.items.length === 0 ? (
          <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
            <h2 className='text-title text-primary'>아직 작업이 없습니다.</h2>
          </section>
        ) : null}
        {props.jobs?.items.map((job) => (
          <Link
            className='flex justify-between border-b py-cluster'
            to='/admin/content-production/jobs/$jobId'
            params={{ jobId: job.id }}
            key={job.id}
          >
            <span>{new Date(job.createdAt).toLocaleString('ko-KR')}</span>
            <Badge>{job.status}</Badge>
          </Link>
        ))}
      </section>
    </section>
  );
}

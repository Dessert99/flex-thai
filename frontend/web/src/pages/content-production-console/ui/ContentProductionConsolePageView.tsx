/** 콘텐츠 제작 form과 최근 job의 독립 상태를 표현한다 */
import type {
  ContentProductionJobListResponse,
  ContentProductionPresetListResponse,
  PromptPreviewResponse,
} from '@flex-thia/contracts';
import { ContentProductionForm } from '@/features/run-content-production';
import { Badge } from '@/shared/ui/badge';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';

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
        <PageLoading message='Preset을 불러오고 있습니다.' />
      ) : null}
      {props.presetsError ? (
        <PageError
          message='Preset을 불러오지 못했습니다.'
          onRetry={props.onRetryPresets}
        />
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
          <PageLoading message='작업을 불러오고 있습니다.' />
        ) : null}
        {props.jobsError ? (
          <PageError
            message='작업을 불러오지 못했습니다.'
            onRetry={props.onRetryJobs}
          />
        ) : null}
        {props.jobs?.items.length === 0 ? (
          <PageEmpty title='아직 작업이 없습니다.' />
        ) : null}
        {props.jobs?.items.map((job) => (
          <a
            className='flex justify-between border-b py-cluster'
            href={`/admin/content-production/jobs/${job.id}`}
            key={job.id}
          >
            <span>{new Date(job.createdAt).toLocaleString('ko-KR')}</span>
            <Badge>{job.status}</Badge>
          </a>
        ))}
      </section>
    </section>
  );
}

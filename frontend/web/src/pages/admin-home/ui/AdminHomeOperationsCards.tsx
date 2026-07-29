/** 관리자 홈의 자동화 운영 상태를 서로 독립적인 카드로 표현한다 */
import type {
  ContentProductionJobListResponse,
  TtsJobListResponse,
  UsageCostOverviewResponse,
} from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageError, PageLoading } from '@/shared/ui/page-state';

interface AdminHomeOperationsCardsProps {
  candidatesError: boolean;
  candidatesLoading: boolean;
  candidatesPendingCount: number;
  contentJobs: ContentProductionJobListResponse['items'];
  contentJobsError: boolean;
  contentJobsLoading: boolean;
  onRetryCandidates: () => void;
  onRetryContentJobs: () => void;
  onRetryTtsJobs: () => void;
  onRetryUsageCost: () => void;
  ttsJobs: TtsJobListResponse['items'];
  ttsJobsError: boolean;
  ttsJobsLoading: boolean;
  usageCost: UsageCostOverviewResponse | undefined;
  usageCostError: boolean;
  usageCostLoading: boolean;
}

/** 운영 query 하나의 실패가 다른 카드와 빠른 진입을 지우지 않게 조합한다 */
export function AdminHomeOperationsCards(props: AdminHomeOperationsCardsProps) {
  return (
    <div className='grid gap-section md:grid-cols-2 xl:grid-cols-4'>
      <PendingCandidatesCard
        count={props.candidatesPendingCount}
        error={props.candidatesError}
        loading={props.candidatesLoading}
        onRetry={props.onRetryCandidates}
      />
      <ContentProductionJobsCard
        error={props.contentJobsError}
        items={props.contentJobs}
        loading={props.contentJobsLoading}
        onRetry={props.onRetryContentJobs}
      />
      <TtsJobsCard
        error={props.ttsJobsError}
        items={props.ttsJobs}
        loading={props.ttsJobsLoading}
        onRetry={props.onRetryTtsJobs}
      />
      <UsageCostCard
        data={props.usageCost}
        error={props.usageCostError}
        loading={props.usageCostLoading}
        onRetry={props.onRetryUsageCost}
      />
    </div>
  );
}

function PendingCandidatesCard({
  count,
  error,
  loading,
  onRetry,
}: {
  count: number;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <OperationalCard
      content={renderOperationalState({
        content: <p className='text-body text-primary'>검토 대기 {count}건</p>,
        error,
        errorMessage: '검토 대기를 불러오지 못했습니다.',
        loading,
        loadingMessage: '검토 대기를 불러오고 있습니다.',
        onRetry,
      })}
      href='/admin/content-production/candidates'
      linkLabel='후보 검수 열기'
      title='게시 검토 대기'
    />
  );
}

function ContentProductionJobsCard({
  error,
  items,
  loading,
  onRetry,
}: {
  error: boolean;
  items: ContentProductionJobListResponse['items'];
  loading: boolean;
  onRetry: () => void;
}) {
  const running = items.filter(({ status }) =>
    ['QUEUED', 'RUNNING'].includes(status),
  ).length;
  const failed = items.filter(({ status }) =>
    ['FAILED', 'COMPLETED_WITH_FAILURES'].includes(status),
  ).length;
  return (
    <OperationalCard
      content={renderOperationalState({
        content: (
          <p className='text-body text-primary'>
            실행 중 {running}건 · 실패 {failed}건
          </p>
        ),
        error,
        errorMessage: 'AI 생성 작업을 불러오지 못했습니다.',
        loading,
        loadingMessage: 'AI 생성 작업을 불러오고 있습니다.',
        onRetry,
      })}
      href='/admin/content-production'
      linkLabel='콘텐츠 생성 열기'
      title='AI 생성 작업'
    />
  );
}

function TtsJobsCard({
  error,
  items,
  loading,
  onRetry,
}: {
  error: boolean;
  items: TtsJobListResponse['items'];
  loading: boolean;
  onRetry: () => void;
}) {
  const running = items.filter(({ status }) =>
    ['QUEUED', 'RUNNING'].includes(status),
  ).length;
  const failed = items.filter(({ status }) =>
    ['FAILED', 'PARTIALLY_FAILED'].includes(status),
  ).length;
  return (
    <OperationalCard
      content={renderOperationalState({
        content: (
          <p className='text-body text-primary'>
            실행 중 {running}건 · 실패 {failed}건
          </p>
        ),
        error,
        errorMessage: 'TTS 작업을 불러오지 못했습니다.',
        loading,
        loadingMessage: 'TTS 작업을 불러오고 있습니다.',
        onRetry,
      })}
      href='/admin/tts?status=FAILED&page=1&pageSize=20'
      linkLabel='TTS retry 열기'
      title='TTS 작업'
    />
  );
}

function UsageCostCard({
  data,
  error,
  loading,
  onRetry,
}: {
  data: UsageCostOverviewResponse | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <OperationalCard
      content={renderOperationalState({
        content: data ? (
          <p className='text-body text-primary'>
            {data.currentMonthThreshold.estimatedCostUsd} USD ·{' '}
            {data.currentMonthThreshold.status}
          </p>
        ) : null,
        error: error || !data,
        errorMessage: '현재 월 비용을 불러오지 못했습니다.',
        loading,
        loadingMessage: '현재 월 비용을 불러오고 있습니다.',
        onRetry,
      })}
      href='/admin/usage-cost'
      linkLabel='비용 화면 열기'
      title='현재 월 AI·TTS 예상 비용'
    />
  );
}

function renderOperationalState({
  content,
  error,
  errorMessage,
  loading,
  loadingMessage,
  onRetry,
}: {
  content: ReactNode;
  error: boolean;
  errorMessage: string;
  loading: boolean;
  loadingMessage: string;
  onRetry: () => void;
}) {
  if (loading) return <PageLoading message={loadingMessage} />;
  if (error)
    return (
      <PageError
        message={errorMessage}
        onRetry={onRetry}
      />
    );
  return content;
}

function OperationalCard({
  content,
  href,
  linkLabel,
  title,
}: {
  content: ReactNode;
  href: string;
  linkLabel: string;
  title: string;
}) {
  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>{title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-cluster'>
        {content}
        <a
          className='text-body text-primary underline-offset-4 hover:underline'
          href={href}
        >
          {linkLabel}
        </a>
      </CardContent>
    </Card>
  );
}

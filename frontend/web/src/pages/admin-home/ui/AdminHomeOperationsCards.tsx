/** 관리자 홈의 전체 운영 집계를 카드별 상태와 실제 진입 경로로 표현한다 */
import { Link } from '@tanstack/react-router';
import type {
  AdminHomeOperationsResponse,
  UsageCostOverviewResponse,
} from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

interface AdminHomeOperationsCardsProps {
  cost: UsageCostOverviewResponse | undefined;
  costError: boolean;
  costLoading: boolean;
  data: AdminHomeOperationsResponse | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  onRetryCost: () => void;
}

type OperationLink = {
  href: string;
  search?: { status: 'FAILED'; page: number; pageSize: number };
  label: string;
};
type OperationalStateProps = Pick<
  AdminHomeOperationsCardsProps,
  'data' | 'error' | 'loading' | 'onRetry'
>;

/** 전용 aggregate의 상태를 각 운영 카드에서 명시적으로 보존한다 */
// eslint-disable-next-line max-lines-per-function -- 여섯 운영 카드는 같은 aggregate 상태와 표현 규칙을 공유한다.
export function AdminHomeOperationsCards({
  cost,
  costError,
  costLoading,
  data,
  error,
  loading,
  onRetry,
  onRetryCost,
}: AdminHomeOperationsCardsProps) {
  const state = { data, error, loading, onRetry };
  return (
    <div className='grid gap-section md:grid-cols-2 xl:grid-cols-3'>
      <OperationalCard
        content={renderOperationalState({
          ...state,
          content: data ? (
            <p className='text-body text-primary'>
              미처리 {data.feedback.pendingCount}건
            </p>
          ) : null,
        })}
        links={[
          {
            href: '/admin/content-error-reports',
            label: '오류 신고 열기',
          },
        ]}
        title='콘텐츠 오류 신고'
      />
      <OperationalCard
        content={renderOperationalState({
          ...state,
          content: data ? (
            <p className='text-body text-primary'>
              문제 {data.candidates.questionPendingCount}건 · 어휘{' '}
              {data.candidates.vocabularyPendingCount}건
            </p>
          ) : null,
        })}
        links={[
          {
            href: '/admin/content-production/candidates',
            label: '문제 후보 검수 열기',
          },
          {
            href: '/admin/content-production/vocabulary-candidates',
            label: '어휘 후보 검수 열기',
          },
        ]}
        title='게시 검토 대기'
      />
      <OperationalCard
        content={renderOperationalState({
          ...state,
          content: data ? (
            <p className='text-body text-primary'>
              실행 중 {data.contentProduction.runningCount}건 · 실패{' '}
              {data.contentProduction.failedCount}건
            </p>
          ) : null,
        })}
        links={[
          {
            href: '/admin/content-production',
            label: '콘텐츠 생성 열기',
          },
        ]}
        title='AI 생성 작업'
      />
      <OperationalCard
        content={renderOperationalState({
          ...state,
          content: data ? (
            <p className='text-body text-primary'>
              실행 중 {data.tts.runningCount}건 · 실패 {data.tts.failedCount}건
            </p>
          ) : null,
        })}
        links={[
          {
            href: '/admin/tts',
            search: { status: 'FAILED', page: 1, pageSize: 20 },
            label: 'TTS retry 열기',
          },
        ]}
        title='TTS 작업'
      />
      <OperationalCard
        content={renderCostState({
          cost,
          error: costError,
          loading: costLoading,
          onRetry: onRetryCost,
          content: cost ? (
            <p className='text-body text-primary'>
              {cost.currentMonthThreshold.estimatedCostUsd} USD ·{' '}
              {cost.currentMonthThreshold.status}
            </p>
          ) : null,
        })}
        links={[{ href: '/admin/usage-cost', label: '비용 화면 열기' }]}
        title='현재 월 AI·TTS 예상 비용'
      />
      <OperationalCard
        content={renderOperationalState({
          ...state,
          content: data ? (
            <p className='text-body text-primary'>
              {data.mfa.enrolled ? '등록됨' : '미등록'} ·{' '}
              {data.mfa.recentVerificationAt
                ? '최근 재인증 확인됨'
                : '최근 재인증 시각 미추적'}
            </p>
          ) : null,
        })}
        links={[{ href: '/admin/users', label: '사용자 관리 열기' }]}
        title='관리자 MFA'
      />
    </div>
  );
}

function renderOperationalState({
  content,
  data,
  error,
  loading,
  onRetry,
}: OperationalStateProps & { content: ReactNode }) {
  if (loading)
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>운영 상태를 불러오고 있습니다.</p>
      </section>
    );
  if (error || !data) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>운영 상태를 불러오지 못했습니다.</p>
          <Button
            className='mt-cluster w-auto'
            onClick={onRetry}
            type='button'
            variant='outline'
          >
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return content;
}

function renderCostState({
  content,
  cost,
  error,
  loading,
  onRetry,
}: {
  content: ReactNode;
  cost: UsageCostOverviewResponse | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>비용 상태를 불러오고 있습니다.</p>
      </section>
    );
  if (error || !cost) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>비용 상태를 불러오지 못했습니다.</p>
          <Button
            className='mt-cluster w-auto'
            onClick={onRetry}
            type='button'
            variant='outline'
          >
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return content;
}

function OperationalCard({
  content,
  links,
  title,
}: {
  content: ReactNode;
  links: OperationLink[];
  title: string;
}) {
  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>{title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-cluster'>
        {content}
        {links.map((link) => (
          <Link
            className='block text-body text-primary underline-offset-4 hover:underline'
            to={link.href}
            search={link.search ?? {}}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

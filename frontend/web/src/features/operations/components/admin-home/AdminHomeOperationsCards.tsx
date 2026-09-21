/** 관리자 홈의 전체 운영 집계를 카드별 상태와 실제 진입 경로로 표현한다 */
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Skeleton } from '@/shared/components/skeleton';
import type { AdminHomeOperationsResponse } from '@flex-thia/contracts/operations/admin-home';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

interface AdminHomeOperationsCardsProps {
  data: AdminHomeOperationsResponse | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
}

type OperationLink = {
  href: string;
  label: string;
};
type OperationalStateProps = Pick<
  AdminHomeOperationsCardsProps,
  'data' | 'error' | 'loading' | 'onRetry'
>;

/** 전용 aggregate의 상태를 각 운영 카드에서 명시적으로 보존한다 */

export function AdminHomeOperationsCards({
  data,
  error,
  loading,
  onRetry,
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
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

import { AdminHomeOperationsCards } from '@/features/operations/components/admin-home/AdminHomeOperationsCards';
import { useAdminHome } from '@/features/operations/hooks/admin-home/useAdminHome';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type { AdminQuestionListResponse } from '@flex-thia/contracts/admin/questions';
import type { AdminVocabularyListResponse } from '@flex-thia/contracts/admin/vocabularies';
import type { AuditLogListResponse } from '@flex-thia/contracts/operations/audit-logs';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function AdminHomePage() {
  const {
    auditLogs,
    auditLogsError,
    auditLogsLoading,
    onRetryAuditLogs,
    onRetryOperations,
    onRetryQuestions,
    onRetryUsageCost,
    onRetryVocabularies,
    operations,
    operationsError,
    operationsLoading,
    questions,
    questionsError,
    questionsLoading,
    usageCost,
    usageCostError,
    usageCostLoading,
    vocabularies,
    vocabulariesError,
    vocabulariesLoading,
  } = useAdminHome();

  return (
    <Container className='max-w-content flex-1'>
      <section
        aria-labelledby='admin-home-title'
        className='flex flex-col gap-section'
      >
        <header className='space-y-cluster'>
          <h1
            className='text-title text-primary'
            id='admin-home-title'
          >
            관리 홈
          </h1>
          <p className='text-body text-subtle'>
            최근 콘텐츠와 자동화 작업의 운영 상태를 확인하세요.
          </p>
        </header>
        <div className='grid gap-section lg:grid-cols-3'>
          <RecentAdminQuestions
            error={questionsError}
            items={questions}
            loading={questionsLoading}
            onRetry={onRetryQuestions}
          />
          <RecentAdminVocabularies
            error={vocabulariesError}
            items={vocabularies}
            loading={vocabulariesLoading}
            onRetry={onRetryVocabularies}
          />
          <RecentAuditLogs
            error={auditLogsError}
            items={auditLogs}
            loading={auditLogsLoading}
            onRetry={onRetryAuditLogs}
          />
        </div>
        <AdminHomeOperationsCards
          cost={usageCost}
          costError={usageCostError}
          costLoading={usageCostLoading}
          data={operations}
          error={operationsError}
          loading={operationsLoading}
          onRetry={onRetryOperations}
          onRetryCost={onRetryUsageCost}
        />
      </section>
    </Container>
  );
}

function RecentAuditLogs({
  error,
  items,
  loading,
  onRetry,
}: {
  error: boolean;
  items: AuditLogListResponse['items'];
  loading: boolean;
  onRetry: () => void;
}) {
  let content: ReactNode;
  if (loading) {
    content = (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>
          최근 감사 기록을 불러오고 있습니다.
        </p>
      </section>
    );
  } else if (error) {
    content = (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>최근 감사 기록을 불러오지 못했습니다.</p>
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
  } else if (items.length === 0) {
    content = (
      <p className='text-body text-subtle'>표시할 최근 감사 기록이 없습니다.</p>
    );
  } else {
    content = (
      <ul className='flex flex-col gap-cluster'>
        {items.map((auditLog) => (
          <li key={auditLog.id}>
            <span className='block rounded-control border border-default p-cluster text-body text-primary'>
              {auditLog.actor.kind === 'USER'
                ? auditLog.actor.email
                : auditLog.actor.label}
              <span className='block text-caption text-subtle'>
                {auditLog.action} · {auditLog.target}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>최근 감사 기록</CardTitle>
      </CardHeader>
      <CardContent className='space-y-cluster'>
        {content}
        <Link
          className='text-body text-primary underline-offset-4 hover:underline'
          to='/admin/audit-logs'
          search={{ page: 1, pageSize: 20 }}
        >
          감사 기록 열기
        </Link>
      </CardContent>
    </Card>
  );
}

function RecentAdminQuestions({
  error,
  items,
  loading,
  onRetry,
}: {
  error: boolean;
  items: AdminQuestionListResponse['items'];
  loading: boolean;
  onRetry: () => void;
}) {
  let content: ReactNode;
  if (loading) {
    content = (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>최근 문제를 불러오고 있습니다.</p>
      </section>
    );
  } else if (error) {
    content = (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>최근 문제를 불러오지 못했습니다.</p>
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
  } else if (items.length === 0) {
    content = (
      <p className='text-body text-subtle'>표시할 최근 문제가 없습니다.</p>
    );
  } else {
    content = (
      <ul className='flex flex-col gap-cluster'>
        {items.map((question) => (
          <li key={question.questionId}>
            <Link
              className='block rounded-control border border-default p-cluster text-body text-primary'
              to='/admin/questions/$questionId'
              search={{ page: 1, pageSize: 20 }}
              params={{ questionId: question.questionId }}
            >
              <span>{question.questionTypeSlug}</span>
              <span className='block text-caption text-subtle'>
                {toQuestionStatusLabel(question.status)} · 난이도{' '}
                {question.difficulty}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>최근 문제</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function RecentAdminVocabularies({
  error,
  items,
  loading,
  onRetry,
}: {
  error: boolean;
  items: AdminVocabularyListResponse['items'];
  loading: boolean;
  onRetry: () => void;
}) {
  let content: ReactNode;
  if (loading) {
    content = (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>최근 어휘를 불러오고 있습니다.</p>
      </section>
    );
  } else if (error) {
    content = (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>최근 어휘를 불러오지 못했습니다.</p>
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
  } else if (items.length === 0) {
    content = (
      <p className='text-body text-subtle'>표시할 최근 어휘가 없습니다.</p>
    );
  } else {
    content = (
      <ul className='flex flex-col gap-cluster'>
        {items.map((vocabulary) => (
          <li key={vocabulary.id}>
            <Link
              className='block rounded-control border border-default p-cluster'
              to='/admin/vocabularies/$vocabularyId'
              search={{ page: 1, pageSize: 20 }}
              params={{ vocabularyId: vocabulary.id }}
            >
              <span
                className='font-thai text-title text-primary'
                lang='th'
              >
                {vocabulary.thai}
              </span>
              <span className='block text-caption text-subtle'>
                {toVocabularyStatusLabel(vocabulary.status)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>최근 어휘</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function toQuestionStatusLabel(
  status: AdminQuestionListResponse['items'][number]['status'],
) {
  return { DRAFT: '초안', HIDDEN: '숨김', PUBLISHED: '게시' }[status];
}

function toVocabularyStatusLabel(
  status: AdminVocabularyListResponse['items'][number]['status'],
) {
  return { DRAFT: '초안', HIDDEN: '숨김', MERGED: '병합됨', PUBLISHED: '게시' }[
    status
  ];
}

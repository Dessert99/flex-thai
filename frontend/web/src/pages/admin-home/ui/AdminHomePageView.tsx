/** 관리자 홈의 최근 콘텐츠와 독립 운영 상태 카드를 표현한다 */
import type {
  AdminHomeOperationsResponse,
  AdminQuestionListResponse,
  AdminVocabularyListResponse,
  AuditLogListResponse,
  UsageCostOverviewResponse,
} from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { AdminHomeOperationsCards } from './AdminHomeOperationsCards';

interface AdminHomePageViewProps {
  auditLogs: AuditLogListResponse['items'];
  auditLogsError: boolean;
  auditLogsLoading: boolean;
  onRetryAuditLogs: () => void;
  onRetryOperations: () => void;
  onRetryQuestions: () => void;
  onRetryUsageCost: () => void;
  onRetryVocabularies: () => void;
  operations: AdminHomeOperationsResponse | undefined;
  operationsError: boolean;
  operationsLoading: boolean;
  questions: AdminQuestionListResponse['items'];
  questionsError: boolean;
  questionsLoading: boolean;
  usageCost: UsageCostOverviewResponse | undefined;
  usageCostError: boolean;
  usageCostLoading: boolean;
  vocabularies: AdminVocabularyListResponse['items'];
  vocabulariesError: boolean;
  vocabulariesLoading: boolean;
}

/** 독립적인 최근 목록과 운영 집계 상태를 지우지 않고 관리 시작점을 제공한다 */
export function AdminHomePageView({
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
}: AdminHomePageViewProps) {
  return (
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
    content = <PageLoading message='최근 감사 기록을 불러오고 있습니다.' />;
  } else if (error) {
    content = (
      <PageError
        message='최근 감사 기록을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
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
        <a
          className='text-body text-primary underline-offset-4 hover:underline'
          href='/admin/audit-logs'
        >
          감사 기록 열기
        </a>
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
    content = <PageLoading message='최근 문제를 불러오고 있습니다.' />;
  } else if (error) {
    content = (
      <PageError
        message='최근 문제를 불러오지 못했습니다.'
        onRetry={onRetry}
      />
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
            <a
              className='block rounded-control border border-default p-cluster text-body text-primary'
              href={`/admin/questions/${question.questionId}`}
            >
              <span>{question.questionTypeSlug}</span>
              <span className='block text-caption text-subtle'>
                {toQuestionStatusLabel(question.status)} · 난이도{' '}
                {question.difficulty}
              </span>
            </a>
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
    content = <PageLoading message='최근 어휘를 불러오고 있습니다.' />;
  } else if (error) {
    content = (
      <PageError
        message='최근 어휘를 불러오지 못했습니다.'
        onRetry={onRetry}
      />
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
            <a
              className='block rounded-control border border-default p-cluster'
              href={`/admin/vocabularies/${vocabulary.id}`}
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
            </a>
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

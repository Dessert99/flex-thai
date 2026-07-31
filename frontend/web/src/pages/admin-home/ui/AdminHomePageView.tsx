/* eslint-disable max-lines -- 기존 최근 콘텐츠와 Wave 6 운영 카드의 전체 화면 표현을 함께 유지한다. */
/** 관리자 홈의 최근 콘텐츠와 독립 운영 상태 카드를 표현한다 */
import type {
  AdminQuestionListResponse,
  AdminVocabularyListResponse,
  AuditLogListResponse,
  ContentProductionJobListResponse,
  TtsJobListResponse,
  UsageCostOverviewResponse,
} from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import { AdminHomeOperationsCards } from './AdminHomeOperationsCards';

interface AdminHomePageViewProps {
  auditLogs: AuditLogListResponse['items'];
  auditLogsError: boolean;
  auditLogsLoading: boolean;
  candidatesError: boolean;
  candidatesLoading: boolean;
  candidatesPendingCount: number;
  contentJobs: ContentProductionJobListResponse['items'];
  contentJobsError: boolean;
  contentJobsLoading: boolean;
  onRetryCandidates: () => void;
  onRetryContentJobs: () => void;
  onRetryAuditLogs: () => void;
  onRetryQuestions: () => void;
  onRetryTtsJobs: () => void;
  onRetryUsageCost: () => void;
  onRetryVocabularies: () => void;
  questions: AdminQuestionListResponse['items'];
  questionsError: boolean;
  questionsLoading: boolean;
  ttsJobs: TtsJobListResponse['items'];
  ttsJobsError: boolean;
  ttsJobsLoading: boolean;
  usageCost: UsageCostOverviewResponse | undefined;
  usageCostError: boolean;
  usageCostLoading: boolean;
  vocabularies: AdminVocabularyListResponse['items'];
  vocabulariesError: boolean;
  vocabulariesLoading: boolean;
}

/** 독립적인 최근 목록 상태를 지우지 않고 관리 시작점을 제공한다 */
// eslint-disable-next-line complexity, max-lines-per-function -- 일곱 독립 카드의 loading/error/empty 상태 조합을 보존한다.
export function AdminHomePageView({
  auditLogs,
  auditLogsError,
  auditLogsLoading,
  candidatesError,
  candidatesLoading,
  candidatesPendingCount,
  contentJobs,
  contentJobsError,
  contentJobsLoading,
  onRetryCandidates,
  onRetryContentJobs,
  onRetryAuditLogs,
  onRetryQuestions,
  onRetryTtsJobs,
  onRetryUsageCost,
  onRetryVocabularies,
  questions,
  questionsError,
  questionsLoading,
  ttsJobs,
  ttsJobsError,
  ttsJobsLoading,
  usageCost,
  usageCostError,
  usageCostLoading,
  vocabularies,
  vocabulariesError,
  vocabulariesLoading,
}: AdminHomePageViewProps) {
  if (
    !questionsLoading &&
    !vocabulariesLoading &&
    !auditLogsLoading &&
    !contentJobsLoading &&
    !candidatesLoading &&
    !ttsJobsLoading &&
    !usageCostLoading &&
    !questionsError &&
    !vocabulariesError &&
    !auditLogsError &&
    !contentJobsError &&
    !candidatesError &&
    !ttsJobsError &&
    !usageCostError &&
    questions.length === 0 &&
    vocabularies.length === 0 &&
    auditLogs.length === 0 &&
    contentJobs.length === 0 &&
    candidatesPendingCount === 0 &&
    ttsJobs.length === 0 &&
    (!usageCost ||
      (usageCost.currentMonthThreshold.estimatedCostUsd === '0.000000' &&
        usageCost.currentMonthThreshold.status === 'NORMAL'))
  ) {
    return (
      <PageEmpty
        action={
          <a
            className='rounded-control bg-primary px-page py-cluster text-primary-foreground'
            href='/admin/questions'
          >
            문제 관리 열기
          </a>
        }
        description='작성된 문제와 어휘가 생기면 이곳에서 바로 확인할 수 있습니다.'
        title='아직 표시할 관리 콘텐츠가 없습니다.'
      />
    );
  }

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
        candidatesError={candidatesError}
        candidatesLoading={candidatesLoading}
        candidatesPendingCount={candidatesPendingCount}
        contentJobs={contentJobs}
        contentJobsError={contentJobsError}
        contentJobsLoading={contentJobsLoading}
        onRetryCandidates={onRetryCandidates}
        onRetryContentJobs={onRetryContentJobs}
        onRetryTtsJobs={onRetryTtsJobs}
        onRetryUsageCost={onRetryUsageCost}
        ttsJobs={ttsJobs}
        ttsJobsError={ttsJobsError}
        ttsJobsLoading={ttsJobsLoading}
        usageCost={usageCost}
        usageCostError={usageCostError}
        usageCostLoading={usageCostLoading}
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

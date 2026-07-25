/** 관리자 문제의 공개 구조·버전·검증 결과만 계약 그대로 표현한다 */
import type { AdminQuestionDetailResponse } from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { isApiError } from '@/shared/api';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageError, PageLoading } from '@/shared/ui/page-state';

interface AdminQuestionDetailPageViewProps {
  actions: ReactNode;
  data: AdminQuestionDetailResponse | undefined;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
  renderVersionAction: (version: Version) => ReactNode;
}

type Version = AdminQuestionDetailResponse['versions'][number];

/** 공개되지 않은 본문을 추정하지 않고 DRAFT에만 전체 교체 진입점을 둔다 */
export function AdminQuestionDetailPageView({
  actions,
  data,
  error,
  loading,
  onRetry,
  renderVersionAction,
}: AdminQuestionDetailPageViewProps) {
  if (loading) {
    return <PageLoading message='문제 상세를 불러오고 있습니다.' />;
  }
  if (error !== null || data === undefined) {
    const problem =
      isApiError(error) && error.detail.kind === 'problem'
        ? error.detail.problem
        : undefined;
    return (
      <PageError
        message={
          problem?.status === 404
            ? '요청한 문제를 찾을 수 없습니다.'
            : '문제 상세를 불러오지 못했습니다.'
        }
        onRetry={onRetry}
        {...(problem === undefined ? {} : { requestId: problem.requestId })}
      />
    );
  }

  return (
    <section className='grid gap-section'>
      <header className='space-y-cluster'>
        <h1 className='text-title text-primary'>문제 상세</h1>
        <p className='break-all text-body text-subtle'>{data.questionId}</p>
        <Badge variant={data.status === 'HIDDEN' ? 'destructive' : 'secondary'}>
          {{ DRAFT: '초안', HIDDEN: '숨김', PUBLISHED: '게시' }[data.status]}
        </Badge>
        <div className='flex flex-wrap gap-cluster'>{actions}</div>
      </header>
      <div className='grid gap-section'>
        {data.versions.map((version) => (
          <QuestionVersionCard
            key={version.id}
            questionId={data.questionId}
            stateAction={renderVersionAction(version)}
            version={version}
          />
        ))}
      </div>
    </section>
  );
}

function QuestionVersionCard({
  questionId,
  stateAction,
  version,
}: {
  questionId: string;
  stateAction: ReactNode;
  version: Version;
}) {
  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-cluster'>
          <CardTitle className='text-title'>버전 {version.version}</CardTitle>
          <div className='flex flex-wrap gap-cluster'>
            <Badge variant='outline'>{toVersionStatus(version.status)}</Badge>
            <Badge
              variant={toValidationBadgeVariant(version.validation.status)}
            >
              {toValidationStatus(version.validation.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        <dl className='grid gap-cluster text-body md:grid-cols-3'>
          <div>
            <dt className='text-subtle'>문제 유형</dt>
            <dd>{version.questionType.slug}</dd>
          </div>
          <div>
            <dt className='text-subtle'>영역</dt>
            <dd>
              {version.questionType.skill === 'READING' ? '읽기' : '듣기'}
            </dd>
          </div>
          <div>
            <dt className='text-subtle'>난이도</dt>
            <dd>{version.difficulty}</dd>
          </div>
          <div>
            <dt className='text-subtle'>블록</dt>
            <dd>{version.blocks.length}개</dd>
          </div>
          <div>
            <dt className='text-subtle'>선택지</dt>
            <dd>{version.options.length}개</dd>
          </div>
          <div>
            <dt className='text-subtle'>정답 option ID</dt>
            <dd className='break-all'>{version.correctOptionId}</dd>
          </div>
        </dl>
        {version.validation.status === 'FAILED' ? (
          <ul className='grid gap-cluster'>
            {version.validation.issues.map(({ path, code }) => (
              <li
                className='rounded-control bg-danger-surface p-cluster text-danger'
                key={`${path}-${code}`}
              >
                {path} · {code}
              </li>
            ))}
          </ul>
        ) : null}
        {version.status === 'DRAFT' ? (
          <a
            className='w-fit rounded-control border border-default px-page py-cluster text-primary'
            href={`/admin/questions/${questionId}/versions/${version.id}/replace`}
          >
            버전 {version.version} 전체 교체
          </a>
        ) : null}
        {stateAction}
      </CardContent>
    </Card>
  );
}

function toValidationBadgeVariant(status: Version['validation']['status']) {
  if (status === 'FAILED') return 'destructive' as const;
  if (status === 'PASSED') return 'secondary' as const;
  return 'outline' as const;
}

function toVersionStatus(status: Version['status']) {
  return {
    DRAFT: '초안',
    INVALIDATED: '무효화',
    PUBLISHED: '게시',
    RETIRED: '폐기',
  }[status];
}

function toValidationStatus(status: Version['validation']['status']) {
  return {
    FAILED: '검증 실패',
    PASSED: '검증 통과',
    PENDING: '검증 대기',
  }[status];
}

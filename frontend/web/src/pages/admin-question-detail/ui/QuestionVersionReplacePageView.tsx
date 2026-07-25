/** 문제 버전 직접 URL의 존재·불변·교체·검증 상태를 표현한다 */
import type {
  AdminQuestionDetailResponse,
  AdminQuestionValidationReport,
  AdminQuestionVersionPayload,
} from '@flex-thia/contracts';
import { isApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { QuestionVersionJsonForm } from './QuestionVersionJsonForm';

interface QuestionVersionReplacePageViewProps {
  data: AdminQuestionDetailResponse | undefined;
  detailError: unknown;
  loading: boolean;
  onReplace: (payload: AdminQuestionVersionPayload) => void;
  onRetry: () => void;
  onValidate: () => void;
  replaceError: unknown;
  replacing: boolean;
  replaced: boolean;
  validationReport: AdminQuestionValidationReport | undefined;
  validating: boolean;
  versionId: string;
}

/** detail에 포함된 DRAFT만 blank canonical form으로 전체 교체한다 */
export function QuestionVersionReplacePageView({
  data,
  detailError,
  loading,
  onReplace,
  onRetry,
  onValidate,
  replaceError,
  replacing,
  replaced,
  validationReport,
  validating,
  versionId,
}: QuestionVersionReplacePageViewProps) {
  if (loading) {
    return <PageLoading message='교체할 문제 버전을 확인하고 있습니다.' />;
  }
  if (detailError !== null || data === undefined) {
    return (
      <PageError
        message='문제 버전을 확인하지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  const version = data.versions.find(({ id }) => id === versionId);
  if (version === undefined) {
    return (
      <p className='text-body text-danger'>
        요청한 문제 버전을 찾을 수 없습니다.
      </p>
    );
  }
  if (version.status !== 'DRAFT') {
    return (
      <p className='text-body text-danger'>
        DRAFT 버전만 전체 교체할 수 있습니다.
      </p>
    );
  }

  return (
    <section className='grid max-w-content gap-section'>
      <header className='space-y-cluster'>
        <h1 className='text-title text-primary'>문제 버전 전체 교체</h1>
        <p className='text-body text-subtle'>버전 {version.version} · DRAFT</p>
      </header>
      <QuestionVersionJsonForm
        disabled={replacing}
        onReplace={onReplace}
      />
      {toReplaceErrorMessage(replaceError) ? (
        <p className='text-body text-danger'>
          {toReplaceErrorMessage(replaceError)}
        </p>
      ) : null}
      {replaced ? (
        <Button
          disabled={validating}
          onClick={onValidate}
          type='button'
          variant='outline'
        >
          버전 검증 실행
        </Button>
      ) : null}
      {validationReport ? <ValidationReport report={validationReport} /> : null}
    </section>
  );
}

function ValidationReport({
  report,
}: {
  report: AdminQuestionValidationReport;
}) {
  return (
    <section
      aria-live='polite'
      className='grid gap-cluster rounded-panel border border-default bg-surface-muted p-page'
    >
      <h2 className='text-title text-primary'>
        {report.status === 'PASSED' ? '검증 통과' : '검증 실패'}
      </h2>
      {report.issues.length > 0 ? (
        <ul className='grid gap-cluster text-danger'>
          {report.issues.map(({ path, code }) => (
            <li key={`${path}-${code}`}>
              {path} · {code}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function toReplaceErrorMessage(error: unknown) {
  if (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.status === 409
  ) {
    return '게시되었거나 변경할 수 없는 버전입니다.';
  }
  return error === null ? undefined : '문제 버전을 교체하지 못했습니다.';
}

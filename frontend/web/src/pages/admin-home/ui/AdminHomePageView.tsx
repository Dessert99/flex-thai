/** 관리자 홈의 최근 문제·어휘를 통계나 추천 없이 표현한다 */
import type {
  AdminQuestionListResponse,
  AdminVocabularyListResponse,
} from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';

interface AdminHomePageViewProps {
  onRetryQuestions: () => void;
  onRetryVocabularies: () => void;
  questions: AdminQuestionListResponse['items'];
  questionsError: boolean;
  vocabularies: AdminVocabularyListResponse['items'];
  vocabulariesError: boolean;
  waiting: boolean;
}

/** 독립적인 최근 목록 상태를 지우지 않고 관리 시작점을 제공한다 */
export function AdminHomePageView({
  onRetryQuestions,
  onRetryVocabularies,
  questions,
  questionsError,
  vocabularies,
  vocabulariesError,
  waiting,
}: AdminHomePageViewProps) {
  if (waiting) {
    return <PageLoading message='관리 홈을 불러오고 있습니다.' />;
  }

  if (
    !questionsError &&
    !vocabulariesError &&
    questions.length === 0 &&
    vocabularies.length === 0
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
          최근 수정된 문제와 어휘를 확인하세요.
        </p>
      </header>
      <div className='grid gap-section lg:grid-cols-2'>
        <RecentAdminQuestions
          error={questionsError}
          items={questions}
          onRetry={onRetryQuestions}
        />
        <RecentAdminVocabularies
          error={vocabulariesError}
          items={vocabularies}
          onRetry={onRetryVocabularies}
        />
      </div>
    </section>
  );
}

function RecentAdminQuestions({
  error,
  items,
  onRetry,
}: {
  error: boolean;
  items: AdminQuestionListResponse['items'];
  onRetry: () => void;
}) {
  let content: ReactNode;
  if (error) {
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
  onRetry,
}: {
  error: boolean;
  items: AdminVocabularyListResponse['items'];
  onRetry: () => void;
}) {
  let content: ReactNode;
  if (error) {
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
  return { DRAFT: '초안', HIDDEN: '숨김', PUBLISHED: '게시' }[status];
}

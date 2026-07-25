/** 학습자 홈의 최근 문제·어휘를 통계나 추천 없이 표현한다 */
import type {
  QuestionListResponse,
  VocabularyListResponse,
} from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';

interface LearnerHomePageViewProps {
  onRetryQuestions: () => void;
  onRetryVocabularies: () => void;
  questions: QuestionListResponse['items'];
  questionsError: boolean;
  vocabularies: VocabularyListResponse['items'];
  vocabulariesError: boolean;
  waiting: boolean;
}

/** 독립적인 최근 목록 상태를 지우지 않고 학습 시작점을 제공한다 */
export function LearnerHomePageView({
  onRetryQuestions,
  onRetryVocabularies,
  questions,
  questionsError,
  vocabularies,
  vocabulariesError,
  waiting,
}: LearnerHomePageViewProps) {
  if (waiting) {
    return <PageLoading message='학습 홈을 불러오고 있습니다.' />;
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
            href='/questions'
          >
            문제 둘러보기
          </a>
        }
        description='게시된 문제와 어휘가 생기면 이곳에서 바로 확인할 수 있습니다.'
        title='아직 표시할 학습 콘텐츠가 없습니다.'
      />
    );
  }

  return (
    <section
      aria-labelledby='learner-home-title'
      className='flex flex-col gap-section'
    >
      <header className='space-y-cluster'>
        <h1
          className='text-title text-primary'
          id='learner-home-title'
        >
          학습 홈
        </h1>
        <p className='text-body text-subtle'>
          최근 공개된 문제와 어휘부터 학습을 시작해 보세요.
        </p>
      </header>
      <div className='grid gap-section lg:grid-cols-2'>
        <RecentQuestions
          error={questionsError}
          items={questions}
          onRetry={onRetryQuestions}
        />
        <RecentVocabularies
          error={vocabulariesError}
          items={vocabularies}
          onRetry={onRetryVocabularies}
        />
      </div>
    </section>
  );
}

function RecentQuestions({
  error,
  items,
  onRetry,
}: {
  error: boolean;
  items: QuestionListResponse['items'];
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
              href={`/questions/${question.questionId}`}
            >
              <span>{question.questionType.displayName}</span>
              <span className='block text-caption text-subtle'>
                {question.skill === 'READING' ? '읽기' : '듣기'} · 난이도{' '}
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

function RecentVocabularies({
  error,
  items,
  onRetry,
}: {
  error: boolean;
  items: VocabularyListResponse['items'];
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
              href={`/vocabularies/${vocabulary.id}`}
            >
              <span
                className='font-thai text-title text-primary'
                lang='th'
              >
                {vocabulary.thai}
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

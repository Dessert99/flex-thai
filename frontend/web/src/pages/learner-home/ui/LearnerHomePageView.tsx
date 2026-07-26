/** 학습자 홈에서 개인화 또는 최근 게시 추천과 이유를 표현한다 */
import type { RecommendationResponse } from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';

interface LearnerHomePageViewProps {
  error: boolean;
  onRetry: () => void;
  recommendation: RecommendationResponse | null;
  waiting: boolean;
}

/** 단일 추천 요청의 로딩·오류·빈 상태와 두 추천 목록을 조립한다 */
export function LearnerHomePageView({
  error,
  onRetry,
  recommendation,
  waiting,
}: LearnerHomePageViewProps) {
  if (waiting) {
    return <PageLoading message='학습 홈을 불러오고 있습니다.' />;
  }

  if (error || recommendation === null) {
    return (
      <PageError
        message='추천 콘텐츠를 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }

  if (
    recommendation.questions.length === 0 &&
    recommendation.vocabularies.length === 0
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

  const personalized = recommendation.mode === 'PERSONALIZED';

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
        {personalized ? (
          <p className='text-body text-subtle'>
            학습 기록을 바탕으로 지금 다시 보면 좋은 콘텐츠를 골랐어요.
          </p>
        ) : (
          <div className='space-y-cluster'>
            <p className='text-body text-primary'>
              개인 추천을 준비하고 있어요.
            </p>
            <p className='text-body text-subtle'>
              학습 신호 {recommendation.meaningfulSignalCount}개 ·{' '}
              {recommendation.activationThreshold}개부터 개인화하며, 지금은 최근
              게시 콘텐츠를 보여드려요.
            </p>
          </div>
        )}
      </header>
      <div className='grid gap-section lg:grid-cols-2'>
        <RecommendedQuestions
          items={recommendation.questions}
          personalized={personalized}
        />
        <RecommendedVocabularies
          items={recommendation.vocabularies}
          personalized={personalized}
        />
      </div>
    </section>
  );
}

function RecommendedQuestions({
  items,
  personalized,
}: {
  items: RecommendationResponse['questions'];
  personalized: boolean;
}) {
  let content: ReactNode;
  if (items.length === 0) {
    content = <p className='text-body text-subtle'>표시할 문제가 없습니다.</p>;
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
              <span className='mt-cluster block text-caption text-subtle'>
                {question.reason}
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
        <CardTitle>
          <h2 className='text-title'>
            {personalized ? '추천 문제' : '최근 문제'}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function RecommendedVocabularies({
  items,
  personalized,
}: {
  items: RecommendationResponse['vocabularies'];
  personalized: boolean;
}) {
  let content: ReactNode;
  if (items.length === 0) {
    content = <p className='text-body text-subtle'>표시할 어휘가 없습니다.</p>;
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
              <span className='mt-cluster block text-caption text-subtle'>
                {vocabulary.reason}
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
        <CardTitle>
          <h2 className='text-title'>
            {personalized ? '추천 어휘' : '최근 어휘'}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

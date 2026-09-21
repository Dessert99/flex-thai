import {
  HomeCard,
  HomeLinkItem,
} from '@/features/learning/components/learner-home/LearnerHomeContent';
import { useLearnerHome } from '@/features/learning/hooks/learner-home/useLearnerHome';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type { RecommendationResponse } from '@flex-thia/contracts/recommendations/recommendations';
import { Link } from '@tanstack/react-router';
import {
  CalendarDays,
  ChevronRight,
  Languages,
  LibraryBig,
  NotebookTabs,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function LearnerHomePage() {
  const { error, onRetry, recommendation, waiting } = useLearnerHome();

  if (waiting) {
    return (
      <Container className='max-w-content flex-1'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>학습 홈을 불러오고 있습니다.</p>
        </section>
      </Container>
    );
  }

  if (error || recommendation === null) {
    return (
      <Container className='max-w-content flex-1'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>추천 콘텐츠를 불러오지 못했습니다.</p>
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
      </Container>
    );
  }

  const personalized = recommendation.mode === 'PERSONALIZED';

  return (
    <Container className='max-w-content flex-1'>
      <section
        aria-labelledby='learner-home-title'
        className='flex flex-col gap-section'
      >
        <header className='space-y-cluster'>
          <div className='flex flex-wrap items-center gap-cluster'>
            <h1
              className='text-heading text-primary'
              id='learner-home-title'
            >
              학습 홈
            </h1>
            <Badge variant='secondary'>
              {personalized ? '맞춤 추천' : '추천 준비 중'}
            </Badge>
          </div>
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
                {recommendation.activationThreshold}개부터 개인화하며, 지금은
                최근 게시 콘텐츠를 보여드려요.
              </p>
            </div>
          )}
        </header>

        <div className='grid gap-section lg:grid-cols-2'>
          <PublishedContentCard
            content={recommendation.publishedToday}
            icon={CalendarDays}
            title='오늘 게시 콘텐츠'
          />
          <PublishedContentCard
            content={recommendation.newContent}
            icon={Sparkles}
            title='NEW 콘텐츠'
          />
        </div>

        <div className='grid gap-section lg:grid-cols-2'>
          <RecommendedVocabularies
            items={recommendation.vocabularies}
            personalized={personalized}
          />
        </div>

        <QuickLinks />
      </section>
    </Container>
  );
}

function PublishedContentCard({
  content,
  icon,
  title,
}: {
  content: RecommendationResponse['publishedToday'];
  icon: LucideIcon;
  title: string;
}) {
  const empty = content.vocabularies.length === 0;

  return (
    <HomeCard
      icon={icon}
      title={title}
    >
      {empty ? (
        <p className='text-body text-subtle'>표시할 콘텐츠가 없습니다.</p>
      ) : (
        <div className='flex flex-col gap-cluster'>
          {content.vocabularies.map((vocabulary) => (
            <HomeLinkItem
              to='/vocabularies/$vocabularyId'
              params={{ vocabularyId: vocabulary.id }}
              icon={Languages}
              key={vocabulary.id}
              title=<span
                className='font-thai text-title'
                lang='th'
              >
                {vocabulary.thai}
              </span>
            />
          ))}
        </div>
      )}
    </HomeCard>
  );
}

const quickLinks = [
  { href: '/vocabularies', icon: LibraryBig, label: '공용 사전' },
  { href: '/wordbooks', icon: NotebookTabs, label: '내 단어장' },
] as const;

function QuickLinks() {
  return (
    <nav aria-label='학습 빠른 이동'>
      <div className='grid gap-cluster sm:grid-cols-2 lg:grid-cols-2'>
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            className='flex items-center gap-cluster rounded-panel border border-default bg-surface p-cluster transition-colors hover:bg-accent focus-visible:outline-ring'
            to={link.href}
          >
            <span className='flex size-control shrink-0 items-center justify-center rounded-control border border-default bg-muted'>
              <link.icon aria-hidden='true' />
            </span>
            <div className='flex min-w-none flex-1 flex-col gap-cluster'>
              <span className='text-body text-primary'>{link.label}</span>
            </div>
            <span className='flex shrink-0 items-center'>
              <ChevronRight
                aria-hidden='true'
                className='text-subtle'
              />
            </span>
          </Link>
        ))}
      </div>
    </nav>
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
      <div className='flex flex-col gap-cluster'>
        {items.map((vocabulary) => (
          <HomeLinkItem
            to='/vocabularies/$vocabularyId'
            params={{ vocabularyId: vocabulary.id }}
            icon={Languages}
            key={vocabulary.id}
            secondaryDescription={vocabulary.reason}
            title=<span
              className='font-thai text-title'
              lang='th'
            >
              {vocabulary.thai}
            </span>
          />
        ))}
      </div>
    );
  }

  return (
    <HomeCard
      icon={Languages}
      title={personalized ? '추천 어휘' : '최근 어휘'}
    >
      {content}
    </HomeCard>
  );
}

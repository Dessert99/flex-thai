/** 학습자 홈에서 개인화 또는 최근 게시 추천과 이유를 표현한다 */
import { Badge } from '@/shared/ui/badge';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/shared/ui/item';
import type { RecommendationResponse } from '@flex-thia/contracts';
import { Link } from '@tanstack/react-router';
import {
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  Languages,
  LibraryBig,
  NotebookTabs,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { HomeCard, HomeLinkItem } from './LearnerHomeContent';

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
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>학습 홈을 불러오고 있습니다.</p>
      </section>
    );
  }

  if (error || recommendation === null) {
    return (
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
    );
  }

  const personalized = recommendation.mode === 'PERSONALIZED';

  return (
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
              {recommendation.activationThreshold}개부터 개인화하며, 지금은 최근
              게시 콘텐츠를 보여드려요.
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
        <RecommendedQuestions
          items={recommendation.questions}
          personalized={personalized}
        />
        <RecommendedVocabularies
          items={recommendation.vocabularies}
          personalized={personalized}
        />
      </div>

      <QuickLinks />
    </section>
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
  const empty =
    content.questions.length === 0 && content.vocabularies.length === 0;

  return (
    <HomeCard
      icon={icon}
      title={title}
    >
      {empty ? (
        <p className='text-body text-subtle'>표시할 콘텐츠가 없습니다.</p>
      ) : (
        <ItemGroup className='gap-cluster'>
          {content.questions.map((question) => (
            <HomeLinkItem
              to='/questions/$questionId'
              params={{ questionId: question.questionId }}
              icon={BookOpenCheck}
              key={question.questionId}
              title={question.questionTypeDisplayName}
            />
          ))}
          {content.vocabularies.map((vocabulary) => (
            <HomeLinkItem
              to='/vocabularies/$vocabularyId'
              params={{ vocabularyId: vocabulary.id }}
              icon={Languages}
              key={vocabulary.id}
              title={
                <span
                  className='font-thai text-title'
                  lang='th'
                >
                  {vocabulary.thai}
                </span>
              }
            />
          ))}
        </ItemGroup>
      )}
    </HomeCard>
  );
}

const quickLinks = [
  { href: '/questions', icon: BookOpenCheck, label: '문제' },
  { href: '/vocabularies', icon: LibraryBig, label: '공용 사전' },
  { href: '/wordbooks', icon: NotebookTabs, label: '내 단어장' },
  { href: '/practice', icon: Target, label: '단어 연습' },
] as const;

function QuickLinks() {
  return (
    <nav aria-label='학습 빠른 이동'>
      <ItemGroup className='grid gap-cluster sm:grid-cols-2 lg:grid-cols-4'>
        {quickLinks.map((link) => (
          <Item
            asChild
            key={link.href}
            variant='outline'
          >
            <Link
              className='bg-surface'
              to={link.href}
            >
              <ItemMedia variant='icon'>
                <link.icon aria-hidden='true' />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className='text-body text-primary'>
                  {link.label}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <ChevronRight
                  aria-hidden='true'
                  className='text-subtle'
                />
              </ItemActions>
            </Link>
          </Item>
        ))}
      </ItemGroup>
    </nav>
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
      <ItemGroup className='gap-cluster'>
        {items.map((question) => (
          <HomeLinkItem
            description={`${question.skill === 'READING' ? '읽기' : ''} · 난이도 ${question.difficulty}`}
            to='/questions/$questionId'
            params={{ questionId: question.questionId }}
            icon={BookOpenCheck}
            key={question.questionId}
            secondaryDescription={question.reason}
            title={question.questionType.displayName}
          />
        ))}
      </ItemGroup>
    );
  }

  return (
    <HomeCard
      icon={Target}
      title={personalized ? '추천 문제' : '최근 문제'}
    >
      {content}
    </HomeCard>
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
      <ItemGroup className='gap-cluster'>
        {items.map((vocabulary) => (
          <HomeLinkItem
            to='/vocabularies/$vocabularyId'
            params={{ vocabularyId: vocabulary.id }}
            icon={Languages}
            key={vocabulary.id}
            secondaryDescription={vocabulary.reason}
            title={
              <span
                className='font-thai text-title'
                lang='th'
              >
                {vocabulary.thai}
              </span>
            }
          />
        ))}
      </ItemGroup>
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

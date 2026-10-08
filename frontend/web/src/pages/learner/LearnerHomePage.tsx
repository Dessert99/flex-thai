import { Container } from '@/shared/components/layouts/Container';
import { Link } from '@tanstack/react-router';
import { ChevronRight, LibraryBig, NotebookTabs } from 'lucide-react';

/** 학습 화면으로 이동하는 기본 홈을 표시한다. */
export function LearnerHomePage() {
  return (
    <Container className='max-w-content flex-1'>
      <section
        aria-labelledby='learner-home-title'
        className='flex flex-col gap-section'
      >
        <h1
          className='text-heading text-primary'
          id='learner-home-title'
        >
          학습 홈
        </h1>
        <QuickLinks />
      </section>
    </Container>
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

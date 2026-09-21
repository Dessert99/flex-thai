/** 학습 홈의 섹션 카드와 내부 탐색 행에 일관된 시각 위계를 제공한다 */
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Link } from '@tanstack/react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function HomeCard({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className='overflow-hidden border-default bg-surface'>
      <CardHeader className='border-b border-default'>
        <CardTitle>
          <h2 className='flex items-center gap-cluster text-title'>
            <Icon
              aria-hidden='true'
              className='text-muted-foreground'
            />
            {title}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function HomeLinkItem({
  description,
  to,
  params,
  icon: Icon,
  secondaryDescription,
  title,
}: {
  description?: ReactNode;
  to: '/vocabularies/$vocabularyId';
  params: { vocabularyId: string };
  icon: LucideIcon;
  secondaryDescription?: ReactNode;
  title: ReactNode;
}) {
  return (
    <Link
      className='flex items-center gap-cluster rounded-panel border border-transparent bg-muted p-cluster transition-colors hover:bg-accent focus-visible:outline-ring'
      to={to}
      params={params}
      search={{ page: 1, pageSize: 20 }}
    >
      <span className='flex size-control shrink-0 items-center justify-center rounded-control border border-default bg-muted'>
        <Icon aria-hidden='true' />
      </span>
      <div className='flex min-w-none flex-1 flex-col gap-cluster'>
        <span className='text-body text-primary'>{title}</span>
        {description ? (
          <p className='line-clamp-2 text-body text-muted-foreground'>
            {description}
          </p>
        ) : null}
        {secondaryDescription ? (
          <p className='line-clamp-2 text-body text-muted-foreground'>
            {secondaryDescription}
          </p>
        ) : null}
      </div>
      <span className='flex shrink-0 items-center'>
        <ChevronRight
          aria-hidden='true'
          className='text-subtle'
        />
      </span>
    </Link>
  );
}

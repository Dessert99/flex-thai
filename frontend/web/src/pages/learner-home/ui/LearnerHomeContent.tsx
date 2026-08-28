/** 학습 홈의 섹션 카드와 내부 탐색 행에 일관된 시각 위계를 제공한다 */
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/shared/ui/item';

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
              className='text-warm'
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
  href,
  icon: Icon,
  secondaryDescription,
  title,
}: {
  description?: ReactNode;
  href: string;
  icon: LucideIcon;
  secondaryDescription?: ReactNode;
  title: ReactNode;
}) {
  return (
    <Item
      asChild
      variant='muted'
    >
      <a href={href}>
        <ItemMedia variant='icon'>
          <Icon aria-hidden='true' />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className='text-body text-primary'>{title}</ItemTitle>
          {description ? (
            <ItemDescription>{description}</ItemDescription>
          ) : null}
          {secondaryDescription ? (
            <ItemDescription>{secondaryDescription}</ItemDescription>
          ) : null}
        </ItemContent>
        <ItemActions>
          <ChevronRight
            aria-hidden='true'
            className='text-subtle'
          />
        </ItemActions>
      </a>
    </Item>
  );
}

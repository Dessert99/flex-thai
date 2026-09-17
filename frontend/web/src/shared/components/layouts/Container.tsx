import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { mergeLayoutClasses } from '@/shared/libs/mergeLayoutClasses';

const containerVariants = cva('mx-auto w-full min-w-none', {
  variants: {
    padding: {
      none: 'p-none',
      cluster: 'p-cluster',
      section: 'p-section',
      page: 'p-page',
    },
  },
  defaultVariants: { padding: 'page' },
});

/** 최대 너비는 사용처의 className에서 지정한다. */
export function Container({
  className,
  padding,
  asChild = false,
  ...props
}: ComponentProps<'div'> &
  VariantProps<typeof containerVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot='container'
      className={mergeLayoutClasses(containerVariants({ padding }), className)}
      {...props}
    />
  );
}

import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { mergeLayoutClasses } from '@/shared/libs/mergeLayoutClasses';

const stackVariants = cva('flex min-w-none flex-col', {
  variants: {
    gap: { none: 'gap-none', cluster: 'gap-cluster', section: 'gap-section' },
  },
  defaultVariants: { gap: 'cluster' },
});

/** 세로 배치와 간격을 제공하며 정렬·너비는 사용처에서 확장한다. */
export function Stack({
  className,
  gap,
  asChild = false,
  ...props
}: ComponentProps<'div'> &
  VariantProps<typeof stackVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot='stack'
      className={mergeLayoutClasses(stackVariants({ gap }), className)}
      {...props}
    />
  );
}

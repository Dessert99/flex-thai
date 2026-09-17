import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { mergeLayoutClasses } from '@/shared/libs/mergeLayoutClasses';

const gridVariants = cva('grid min-w-none grid-cols-1', {
  variants: {
    gap: { none: 'gap-none', cluster: 'gap-cluster', section: 'gap-section' },
  },
  defaultVariants: { gap: 'cluster' },
});

/** 반응형 열 개수는 className으로 지정한다. */
export function Grid({
  className,
  gap,
  asChild = false,
  ...props
}: ComponentProps<'div'> &
  VariantProps<typeof gridVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot='grid'
      className={mergeLayoutClasses(gridVariants({ gap }), className)}
      {...props}
    />
  );
}

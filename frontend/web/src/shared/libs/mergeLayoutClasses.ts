import { createCn } from 'cn/config';

/** 레이아웃의 semantic token도 Tailwind 충돌 그룹에 포함한다. */
export const mergeLayoutClasses = createCn({
  extend: {
    theme: {
      spacing: [
        'none',
        'avatar',
        'profile-menu',
        'cluster',
        'control',
        'collapsible',
        'page',
        'section',
        'icon',
        'state',
      ],
      container: ['content', 'form'],
    },
  },
});

/** production 테마와 일관된 canvas 조건을 모든 shared/ui story에 적용한다 */
import type { Preview } from '@storybook/react-vite';
import '../src/app/styles/theme.css';

const preview = {
  parameters: {
    controls: {
      expanded: true,
    },
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Preview;

/** story마다 중복하지 않을 전역 문서·레이아웃 조건을 제공한다 */
export default preview;

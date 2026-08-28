/** shared/ui의 시각적 계약만 수집해 제품 Storybook의 범위를 작게 유지한다 */
import type { StorybookConfig } from '@storybook/react-vite';

const config = {
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/shared/ui/**/*.stories.@(ts|tsx)'],
} satisfies StorybookConfig;

/** 애플리케이션과 같은 Vite 기반으로 shared/ui Storybook을 구성한다 */
export default config;

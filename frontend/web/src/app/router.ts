/** 생성된 route tree에 애플리케이션 외부 store context를 주입한다 */
import type { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { authSessionStore } from '@/shared/api';
import { routeTree } from '../routeTree.gen';

/** 동일 QueryClient를 route loader context와 Router에 연결한다 */
export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    context: {
      authSessionStore,
      queryClient,
    },
    defaultPreload: 'intent',
    routeTree,
  });
}

/** file route와 navigation API가 애플리케이션 Router type을 사용한다 */
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

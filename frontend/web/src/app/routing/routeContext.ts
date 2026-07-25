/** route guard와 loader가 공유하는 애플리케이션 의존성을 정의한다 */
import type { QueryClient } from '@tanstack/react-query';
import type { AuthSessionStore } from '@/shared/api';

/** Router 생성 시 한 번 주입하는 외부 store context */
export interface RouterContext {
  authSessionStore: AuthSessionStore;
  queryClient: QueryClient;
}

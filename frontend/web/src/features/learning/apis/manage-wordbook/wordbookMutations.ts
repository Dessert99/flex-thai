/** 단어장 삭제 요청을 제공한다. */
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';

/** 소유 단어장을 삭제한다 */
export function deleteWordbook(wordbookId: string): Promise<void> {
  return authenticatedRequest({
    method: 'DELETE',
    path: `/me/wordbooks/${wordbookId}`,
    response: { kind: 'empty' },
  });
}

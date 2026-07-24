/** local 응답에서 private storage key를 숨기는 deterministic media URL을 만든다 */
import type { MediaReadUrlProvider } from '@flex-thia/domain';
import { createHash } from 'node:crypto';

/** 같은 storage key를 재현 가능한 opaque test URL로만 노출한다 */
export class FakeMediaReadUrlProvider implements MediaReadUrlProvider {
  /** 만료 시각과 무관하게 같은 asset을 같은 local URL로 매핑한다 */
  createReadUrl(storageKey: string, expiresAt: Date): Promise<string> {
    void expiresAt;
    const opaquePath = createHash('sha256')
      .update(storageKey)
      .digest('base64url');
    return Promise.resolve(
      `https://fake-media.invalid/media/${encodeURIComponent(opaquePath)}`,
    );
  }
}

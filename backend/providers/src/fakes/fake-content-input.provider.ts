/** 외부 storage 없이 inputKey별 bytes를 제공하는 local reader */
import type { ContentProductionInputReader } from '@flex-thia/domain';

/** 등록된 text fixture를 UTF-8 bytes로 반환한다 */
export class FakeContentInputReader implements ContentProductionInputReader {
  constructor(private readonly fixtures: Record<string, string>) {}

  /** exact inputKey가 없거나 취소된 읽기를 명시적으로 거절한다 */
  read(
    input: Parameters<ContentProductionInputReader['read']>[0],
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    if (signal.aborted) {
      return Promise.reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error('콘텐츠 입력 읽기가 취소되었습니다'),
      );
    }
    const fixture = this.fixtures[input.inputKey];

    if (fixture === undefined) {
      return Promise.reject(new Error('CONTENT_INPUT_NOT_FOUND'));
    }
    return Promise.resolve(new TextEncoder().encode(fixture));
  }
}

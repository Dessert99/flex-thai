/** 외부 OCR 없이 PDF·IMAGE bytes를 text로 재현하는 local provider */
import type { ContentOcrProvider } from '@flex-thia/domain';

/** UTF-8 fixture를 OCR 결과처럼 반환한다 */
export class FakeContentOcrProvider implements ContentOcrProvider {
  /** 취소 신호를 지키고 bytes를 결정적으로 decode한다 */
  recognize(
    input: Parameters<ContentOcrProvider['recognize']>[0],
  ): Promise<{ text: string }> {
    if (input.signal.aborted) {
      return Promise.reject(
        input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error('콘텐츠 OCR이 취소되었습니다'),
      );
    }
    return Promise.resolve({
      text: new TextDecoder('utf-8', { fatal: true }).decode(input.bytes),
    });
  }
}

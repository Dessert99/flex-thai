/** 태국어 원문을 상호작용 token과 일반 텍스트 구간으로 분리한다 */
import type { PublicThaiSentence } from '@flex-thia/contracts';

/** 태국어 문장에서 렌더링할 연속 구간 */
export type ThaiSentenceSegment =
  | { kind: 'TOKEN'; text: string; tokenIndex: number }
  | { kind: 'TEXT'; text: string };

/** Unicode code point offset을 기준으로 원문과 token을 손실 없이 분리한다 */
export function segmentThaiSentence(
  sentence: PublicThaiSentence,
): ThaiSentenceSegment[] {
  const characters = Array.from(sentence.originalText);
  const tokens = [...sentence.tokens].sort(
    (left, right) => left.startOffset - right.startOffset,
  );
  const segments: ThaiSentenceSegment[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (cursor < token.startOffset) {
      segments.push({
        kind: 'TEXT',
        text: characters.slice(cursor, token.startOffset).join(''),
      });
    }

    segments.push({
      kind: 'TOKEN',
      text: characters.slice(token.startOffset, token.endOffset).join(''),
      tokenIndex: token.position,
    });
    cursor = token.endOffset;
  }

  if (cursor < characters.length) {
    segments.push({
      kind: 'TEXT',
      text: characters.slice(cursor).join(''),
    });
  }

  return segments;
}

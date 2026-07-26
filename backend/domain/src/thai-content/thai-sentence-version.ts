/** 태국어 문장 스냅샷의 Unicode 범위와 동결 불변 조건을 정의한다 */

/** 태국어 token이 문장에서 맡는 학습 역할 */
export type ThaiTokenRole =
  | 'TARGET'
  | 'REQUIRED'
  | 'SUPPORTING'
  | 'INSTRUCTION';

/** 문장 원문에서 어휘가 차지하는 code point 범위 */
export interface ThaiTokenOccurrenceInput {
  position: number;
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  role: ThaiTokenRole;
}

/** 여러 토큰에 걸친 공용 표현 범위 */
export interface ThaiExpressionOccurrenceInput {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  vocabularyKind: 'WORD' | 'EXPRESSION';
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  adminSelected: boolean;
}

/** 표시할 태국어 문장의 불변 버전 입력 */
export interface ThaiSentenceVersionInput {
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
  tokens: ThaiTokenOccurrenceInput[];
  expressions: ThaiExpressionOccurrenceInput[];
}

/** 가져오기와 게시 검증이 공유하는 경로 기반 문장 오류 */
export interface ThaiContentValidationIssue {
  path: string;
  code:
    | 'TOKEN_POSITION_INVALID'
    | 'TOKEN_RANGE_INVALID'
    | 'TOKEN_RANGE_OVERLAP'
    | 'TOKEN_SURFACE_MISMATCH'
    | 'EXPRESSION_RANGE_INVALID'
    | 'EXPRESSION_VOCABULARY_REQUIRED';
}

/** 동결된 문장 버전의 변경 시도를 안정적인 code로 전달한다 */
export class ThaiContentDomainError extends Error {
  constructor(readonly code: 'THAI_SENTENCE_VERSION_IMMUTABLE') {
    super(code);
    this.name = 'ThaiContentDomainError';
  }
}

/** code point 기준 토큰 범위와 원문 복원 가능성을 모두 검사한다 */
export const validateThaiSentenceVersion = (
  input: ThaiSentenceVersionInput,
): ThaiContentValidationIssue[] => {
  const codePoints = Array.from(input.originalText);
  const issues: ThaiContentValidationIssue[] = [];
  let previousEnd = 0;
  input.tokens.forEach((token, index) => {
    if (token.position !== index) {
      issues.push({
        path: `tokens.${index}.position`,
        code: 'TOKEN_POSITION_INVALID',
      });
    }
    if (
      !Number.isInteger(token.startOffset) ||
      !Number.isInteger(token.endOffset) ||
      token.startOffset < 0 ||
      token.endOffset <= token.startOffset ||
      token.endOffset > codePoints.length
    ) {
      issues.push({
        path: `tokens.${index}`,
        code: 'TOKEN_RANGE_INVALID',
      });
      return;
    }
    if (token.startOffset < previousEnd) {
      issues.push({
        path: `tokens.${index}`,
        code: 'TOKEN_RANGE_OVERLAP',
      });
    }
    if (
      codePoints.slice(token.startOffset, token.endOffset).join('') !==
      token.surface
    ) {
      issues.push({
        path: `tokens.${index}.surface`,
        code: 'TOKEN_SURFACE_MISMATCH',
      });
    }
    previousEnd = Math.max(previousEnd, token.endOffset);
  });
  input.expressions.forEach((expression, index) => {
    if (
      !Number.isInteger(expression.startTokenIndex) ||
      !Number.isInteger(expression.endTokenIndex) ||
      expression.startTokenIndex < 0 ||
      expression.endTokenIndex - expression.startTokenIndex < 2 ||
      expression.endTokenIndex > input.tokens.length
    ) {
      issues.push({
        path: `expressions.${index}`,
        code: 'EXPRESSION_RANGE_INVALID',
      });
    }
    if (expression.vocabularyKind !== 'EXPRESSION') {
      issues.push({
        path: `expressions.${index}.vocabularyId`,
        code: 'EXPRESSION_VOCABULARY_REQUIRED',
      });
    }
  });
  return issues;
};

const overlaps = (
  left: ThaiExpressionOccurrenceInput,
  right: ThaiExpressionOccurrenceInput,
): boolean =>
  left.startTokenIndex < right.endTokenIndex &&
  right.startTokenIndex < left.endTokenIndex;

const comparePriority = (
  left: ThaiExpressionOccurrenceInput,
  right: ThaiExpressionOccurrenceInput,
): number =>
  Number(right.adminSelected) - Number(left.adminSelected) ||
  right.endTokenIndex -
    right.startTokenIndex -
    (left.endTokenIndex - left.startTokenIndex) ||
  left.startTokenIndex - right.startTokenIndex;

/** 겹침 연결군마다 관리자 지정·길이·시작 위치 우선순위로 대표 하나를 고른다 */
export const resolveRepresentativeExpressions = (
  expressions: readonly ThaiExpressionOccurrenceInput[],
): Array<ThaiExpressionOccurrenceInput & { representative: boolean }> => {
  const representatives = new Set<number>();
  const visited = new Set<number>();
  expressions.forEach((_, startIndex) => {
    if (visited.has(startIndex)) return;
    const group: number[] = [];
    const queue = [startIndex];
    visited.add(startIndex);
    // 전이적으로 겹친 범위도 하나의 표시 충돌군으로 묶는다.
    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);
      expressions.forEach((candidate, candidateIndex) => {
        if (
          !visited.has(candidateIndex) &&
          overlaps(expressions[current]!, candidate)
        ) {
          visited.add(candidateIndex);
          queue.push(candidateIndex);
        }
      });
    }
    const winner = [...group].sort((left, right) =>
      comparePriority(expressions[left]!, expressions[right]!),
    )[0]!;
    representatives.add(winner);
  });
  return expressions.map((expression, index) => ({
    ...expression,
    representative: representatives.has(index),
  }));
};

/** 문제 게시로 동결된 문장 스냅샷의 수정을 차단한다 */
export const assertThaiSentenceVersionMutable = (
  frozenAt: Date | null,
): void => {
  if (frozenAt) {
    throw new ThaiContentDomainError('THAI_SENTENCE_VERSION_IMMUTABLE');
  }
};

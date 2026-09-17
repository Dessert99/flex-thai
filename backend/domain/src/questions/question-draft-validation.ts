/** 기존 가져오기 파일의 문장 입력을 검증한다. */
import type { GeneratedDraftSentenceInput } from '../content-import/content-import.js';
import { QuestionAdminError } from './question-admin.js';
const isCanonicalUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
type UnknownRecord = Record<string, unknown>;

const failInvalidContent = (path: string): never => {
  throw new QuestionAdminError('QUESTION_CONTENT_INVALID', path);
};

const requireRecord = (value: unknown, path: string): UnknownRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failInvalidContent(path);
  }
  return value as UnknownRecord;
};

const requireExactKeys = (
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void => {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    failInvalidContent(path);
  }
};

const requireNonemptyString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    return failInvalidContent(path);
  }
  return value;
};

const requireSafeInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return failInvalidContent(path);
  }
  return value;
};

const requireArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    return failInvalidContent(path);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      failInvalidContent(`${path}.${index}`);
    }
  }
  return value;
};

const requireEnum = (
  value: unknown,
  allowed: readonly string[],
  path: string,
): string => {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return failInvalidContent(path);
  }
  return value;
};

const requireUuid = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !isCanonicalUuid(value)) {
    return failInvalidContent(path);
  }
  return value;
};

const assertReference = (value: unknown, path: string): void => {
  const reference = requireRecord(value, path);
  const keys = Object.keys(reference);
  if (keys.length !== 1) {
    failInvalidContent(path);
  }
  if (keys[0] === 'id') {
    requireUuid(reference.id, `${path}.id`);
    return;
  }
  if (keys[0] === 'clientRef') {
    requireNonemptyString(reference.clientRef, `${path}.clientRef`);
    // 전체 교체 요청에는 import 안에서 만든 clientRef를 해석할 문맥이 없다.
    throw new QuestionAdminError('QUESTION_REFERENCE_MISMATCH', path);
  }
  failInvalidContent(path);
};

const assertSentenceInput = (value: unknown, path: string): void => {
  const sentence = requireRecord(value, path);
  requireExactKeys(
    sentence,
    [
      'originalText',
      'translationKo',
      'pronunciationKo',
      'toneMarks',
      'tokens',
      'expressions',
    ],
    [],
    path,
  );
  const originalText = requireNonemptyString(
    sentence.originalText,
    `${path}.originalText`,
  );
  requireNonemptyString(sentence.translationKo, `${path}.translationKo`);
  requireNonemptyString(sentence.pronunciationKo, `${path}.pronunciationKo`);
  if (typeof sentence.toneMarks !== 'string') {
    failInvalidContent(`${path}.toneMarks`);
  }

  const codePoints = Array.from(originalText);
  let previousEnd = 0;
  const tokens = requireArray(sentence.tokens, `${path}.tokens`);
  tokens.forEach((value, index) => {
    const tokenPath = `${path}.tokens.${index}`;
    const token = requireRecord(value, tokenPath);
    requireExactKeys(
      token,
      [
        'surface',
        'startOffset',
        'endOffset',
        'vocabulary',
        'meaning',
        'pronunciation',
        'contextMeaningKo',
        'role',
      ],
      [],
      tokenPath,
    );
    const surface = requireNonemptyString(
      token.surface,
      `${tokenPath}.surface`,
    );
    const startOffset = requireSafeInteger(
      token.startOffset,
      0,
      Number.MAX_SAFE_INTEGER,
      `${tokenPath}.startOffset`,
    );
    const endOffset = requireSafeInteger(
      token.endOffset,
      1,
      Number.MAX_SAFE_INTEGER,
      `${tokenPath}.endOffset`,
    );
    assertReference(token.vocabulary, `${tokenPath}.vocabulary`);
    assertReference(token.meaning, `${tokenPath}.meaning`);
    assertReference(token.pronunciation, `${tokenPath}.pronunciation`);
    requireNonemptyString(
      token.contextMeaningKo,
      `${tokenPath}.contextMeaningKo`,
    );
    requireEnum(
      token.role,
      ['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION'],
      `${tokenPath}.role`,
    );
    if (
      endOffset <= startOffset ||
      endOffset > codePoints.length ||
      startOffset < previousEnd
    ) {
      failInvalidContent(tokenPath);
    }
    if (codePoints.slice(startOffset, endOffset).join('') !== surface) {
      failInvalidContent(`${tokenPath}.surface`);
    }
    previousEnd = Math.max(previousEnd, endOffset);
  });

  const expressions = requireArray(sentence.expressions, `${path}.expressions`);
  expressions.forEach((value, index) => {
    const expressionPath = `${path}.expressions.${index}`;
    const expression = requireRecord(value, expressionPath);
    requireExactKeys(
      expression,
      [
        'startTokenIndex',
        'endTokenIndex',
        'vocabulary',
        'meaning',
        'pronunciation',
        'contextMeaningKo',
      ],
      ['representative'],
      expressionPath,
    );
    const startTokenIndex = requireSafeInteger(
      expression.startTokenIndex,
      0,
      Number.MAX_SAFE_INTEGER,
      `${expressionPath}.startTokenIndex`,
    );
    const endTokenIndex = requireSafeInteger(
      expression.endTokenIndex,
      1,
      Number.MAX_SAFE_INTEGER,
      `${expressionPath}.endTokenIndex`,
    );
    assertReference(expression.vocabulary, `${expressionPath}.vocabulary`);
    assertReference(expression.meaning, `${expressionPath}.meaning`);
    assertReference(
      expression.pronunciation,
      `${expressionPath}.pronunciation`,
    );
    requireNonemptyString(
      expression.contextMeaningKo,
      `${expressionPath}.contextMeaningKo`,
    );
    if (
      expression.representative !== undefined &&
      typeof expression.representative !== 'boolean'
    ) {
      failInvalidContent(`${expressionPath}.representative`);
    }
    if (endTokenIndex - startTokenIndex < 2 || endTokenIndex > tokens.length) {
      failInvalidContent(expressionPath);
    }
  });
};

export const assertGeneratedDraftSentenceInput: (
  value: unknown,
  path: string,
) => asserts value is GeneratedDraftSentenceInput = (value, path) => {
  assertSentenceInput(value, path);
};

/** 공용 태국어 어휘의 정규화 키와 게시 상태 전이를 정의한다 */
import {
  assertMediaAssetReady,
  type MediaAsset,
} from '../media/media-asset.js';
import { normalizeThaiSearchText } from './normalize-thai-search-text.js';

/** 공용 어휘 또는 다단어 표현 */
export interface Vocabulary {
  id: string;
  thai: string;
  normalizedThai: string;
  kind: 'WORD' | 'EXPRESSION';
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'MERGED';
  mergedIntoVocabularyId?: string | null;
}

/** 어휘 상태 전이 위반을 안정적인 code로 전달한다 */
export class VocabularyDomainError extends Error {
  constructor(
    readonly code:
      | 'VOCABULARY_EMPTY'
      | 'VOCABULARY_AUDIO_NOT_READY'
      | 'VOCABULARY_STATE_CONFLICT',
  ) {
    super(code);
    this.name = 'VocabularyDomainError';
  }
}

/** 표시 원문을 보존하면서 정확 중복 판정용 표기를 계산한다 */
export const createVocabularyDraft = (input: {
  id: string;
  thai: string;
  kind: Vocabulary['kind'];
}): Vocabulary => {
  const normalizedThai = normalizeThaiSearchText(input.thai);
  if (!normalizedThai) {
    throw new VocabularyDomainError('VOCABULARY_EMPTY');
  }
  return { ...input, normalizedThai, status: 'DRAFT' };
};

/** 발음이 있고 모든 음성이 준비된 초안만 게시한다 */
export const publishVocabulary = (
  vocabulary: Vocabulary,
  pronunciationAssets: readonly MediaAsset[],
): Vocabulary => {
  if (vocabulary.status !== 'DRAFT') {
    throw new VocabularyDomainError('VOCABULARY_STATE_CONFLICT');
  }
  if (pronunciationAssets.length === 0) {
    throw new VocabularyDomainError('VOCABULARY_AUDIO_NOT_READY');
  }
  try {
    pronunciationAssets.forEach(assertMediaAssetReady);
  } catch {
    throw new VocabularyDomainError('VOCABULARY_AUDIO_NOT_READY');
  }
  return { ...vocabulary, status: 'PUBLISHED' };
};

/** 게시된 어휘를 참조 보존 상태로 숨긴다 */
export const hideVocabulary = (vocabulary: Vocabulary): Vocabulary => {
  if (vocabulary.status !== 'PUBLISHED') {
    throw new VocabularyDomainError('VOCABULARY_STATE_CONFLICT');
  }
  return { ...vocabulary, status: 'HIDDEN' };
};

/** 숨긴 어휘를 다시 공개한다 */
export const restoreVocabulary = (vocabulary: Vocabulary): Vocabulary => {
  if (vocabulary.status !== 'HIDDEN') {
    throw new VocabularyDomainError('VOCABULARY_STATE_CONFLICT');
  }
  return { ...vocabulary, status: 'PUBLISHED' };
};

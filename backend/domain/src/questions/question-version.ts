/** 선택형 문제 버전의 구조와 최신 콘텐츠 게시 조건을 검증한다 */
import type { MediaAsset } from '../media/media-asset.js';
import { assertMediaAssetReady } from '../media/media-asset.js';
import type { ThaiSentenceVersionInput } from '../thai-content/thai-sentence-version.js';
import { validateThaiSentenceVersion } from '../thai-content/thai-sentence-version.js';

/** 선택형 문제 템플릿 */
export type QuestionTemplate =
  | 'STANDARD_CHOICE'
  | 'PASSAGE_CHOICE'
  | 'DIALOGUE_CHOICE'
  | 'INLINE_SPAN_CHOICE';

/** 문장 token 범위에 연결된 선택지 */
export interface QuestionOptionSpan {
  sentenceVersionId: string;
  startTokenIndex: number;
  endTokenIndex: number;
}

/** 문제 화면을 구성하는 블록 종류 */
export type QuestionBlockKind =
  'INSTRUCTION' | 'PASSAGE' | 'DIALOGUE' | 'QUESTION' | 'EXPLANATION';

/** 문장 텍스트와 음성의 초기 표시 방식 */
export type QuestionDisplayMode =
  'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO' | 'AUDIO_THEN_REVEAL';

/** 게시 검증이 확인할 공용 어휘 현재 상태 */
export interface ReferencedVocabularyState {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'MERGED';
}

/** 문장 입력과 게시 시점의 최신 참조 상태 */
export interface QuestionSentenceCandidate {
  id: string;
  input: ThaiSentenceVersionInput;
  mediaAsset: MediaAsset;
  referencedVocabularies: ReferencedVocabularyState[];
  pronunciationMediaAssets: Array<MediaAsset | null>;
}

interface QuestionOptionCandidateBase {
  id: string;
  position: number;
  isCorrect: boolean;
}

/** 일반 선택지 문장 또는 QUESTION 문장 inline 범위 중 하나인 검증 후보 */
export type QuestionOptionCandidate =
  | (QuestionOptionCandidateBase & {
      sentence: QuestionSentenceCandidate;
      span: null;
    })
  | (QuestionOptionCandidateBase & {
      sentence: null;
      span: QuestionOptionSpan;
    });

/** 검증할 문제 버전 전체 스냅샷 */
export interface QuestionVersionValidationCandidate {
  id: string;
  questionId: string;
  difficulty: number;
  typeVersion: {
    id: string;
    template: QuestionTemplate;
    optionCount: number;
  };
  blocks: Array<{
    id: string;
    kind: QuestionBlockKind;
    displayMode: QuestionDisplayMode;
    position: number;
    sentences: Array<{
      speaker: string | null;
      sentence: QuestionSentenceCandidate;
    }>;
  }>;
  options: QuestionOptionCandidate[];
}

/** 문제 게시 불가 원인을 안정적인 path와 code로 보존한다 */
export interface QuestionValidationIssue {
  path: string;
  code:
    | 'DIFFICULTY_INVALID'
    | 'BLOCK_POSITION_INVALID'
    | 'OPTION_POSITION_INVALID'
    | 'OPTION_COUNT_INVALID'
    | 'CORRECT_OPTION_COUNT_INVALID'
    | 'INLINE_SPAN_INVALID'
    | 'QUESTION_TEMPLATE_INVALID'
    | 'DIALOGUE_SPEAKER_REQUIRED'
    | 'THAI_CONTENT_INVALID'
    | 'VOCABULARY_NOT_PUBLISHED'
    | 'MEDIA_ASSET_NOT_READY';
}

/** 관리자 검증 응답과 DB 저장이 공유하는 결정 규칙 보고서 */
export interface QuestionValidationReport {
  status: 'PASSED' | 'FAILED';
  issues: QuestionValidationIssue[];
}

const hasExactlyOneBlock = (
  candidate: QuestionVersionValidationCandidate,
  kind: QuestionBlockKind,
): boolean =>
  candidate.blocks.filter((block) => block.kind === kind).length === 1;

const isTemplateValid = (
  candidate: QuestionVersionValidationCandidate,
): boolean => {
  const hasPassage = candidate.blocks.some((block) => block.kind === 'PASSAGE');
  const hasDialogue = candidate.blocks.some(
    (block) => block.kind === 'DIALOGUE',
  );
  const hasQuestion = hasExactlyOneBlock(candidate, 'QUESTION');

  if (candidate.typeVersion.template === 'STANDARD_CHOICE') {
    return hasQuestion && !hasPassage && !hasDialogue;
  }
  if (candidate.typeVersion.template === 'PASSAGE_CHOICE') {
    return (
      hasQuestion && hasExactlyOneBlock(candidate, 'PASSAGE') && !hasDialogue
    );
  }
  if (candidate.typeVersion.template === 'INLINE_SPAN_CHOICE') {
    const question = candidate.blocks.find(
      (block) => block.kind === 'QUESTION',
    );
    return (
      hasQuestion &&
      !hasPassage &&
      !hasDialogue &&
      question?.sentences.length === 1
    );
  }
  return (
    hasQuestion && hasExactlyOneBlock(candidate, 'DIALOGUE') && !hasPassage
  );
};

const validateSentence = (
  sentence: QuestionSentenceCandidate,
  path: string,
): QuestionValidationIssue[] => {
  const issues: QuestionValidationIssue[] = validateThaiSentenceVersion(
    sentence.input,
  ).map((issue) => ({
    path: `${path}.${issue.path}`,
    code: 'THAI_CONTENT_INVALID',
  }));

  try {
    assertMediaAssetReady(sentence.mediaAsset);
  } catch {
    issues.push({ path: `${path}.mediaAsset`, code: 'MEDIA_ASSET_NOT_READY' });
  }

  sentence.pronunciationMediaAssets.forEach((mediaAsset, index) => {
    if (mediaAsset === null) {
      issues.push({
        path: `${path}.pronunciationMediaAssets.${index}`,
        code: 'MEDIA_ASSET_NOT_READY',
      });
      return;
    }
    try {
      assertMediaAssetReady(mediaAsset);
    } catch {
      issues.push({
        path: `${path}.pronunciationMediaAssets.${index}`,
        code: 'MEDIA_ASSET_NOT_READY',
      });
    }
  });

  sentence.referencedVocabularies.forEach((vocabulary, index) => {
    if (vocabulary.status !== 'PUBLISHED') {
      issues.push({
        path: `${path}.referencedVocabularies.${index}`,
        code: 'VOCABULARY_NOT_PUBLISHED',
      });
    }
  });

  return issues;
};

/** 문제 구조와 현재 참조 콘텐츠가 게시 조건을 만족하는지 검증한다 */
export const validateQuestionVersion = (
  candidate: QuestionVersionValidationCandidate,
): QuestionValidationReport => {
  const issues: QuestionValidationIssue[] = [];

  if (
    !Number.isInteger(candidate.difficulty) ||
    candidate.difficulty < 1 ||
    candidate.difficulty > 5
  ) {
    issues.push({ path: 'difficulty', code: 'DIFFICULTY_INVALID' });
  }

  candidate.blocks.forEach((block, blockIndex) => {
    if (block.position !== blockIndex) {
      issues.push({
        path: `blocks.${blockIndex}.position`,
        code: 'BLOCK_POSITION_INVALID',
      });
    }
    block.sentences.forEach(({ speaker, sentence }, sentenceIndex) => {
      const sentencePath = `blocks.${blockIndex}.sentences.${sentenceIndex}`;
      if (block.kind === 'DIALOGUE' && !speaker?.trim()) {
        issues.push({
          path: `${sentencePath}.speaker`,
          code: 'DIALOGUE_SPEAKER_REQUIRED',
        });
      }
      issues.push(...validateSentence(sentence, sentencePath));
    });
  });

  candidate.options.forEach((option, optionIndex) => {
    if (option.position !== optionIndex) {
      issues.push({
        path: `options.${optionIndex}.position`,
        code: 'OPTION_POSITION_INVALID',
      });
    }
    if (option.sentence !== null) {
      issues.push(
        ...validateSentence(option.sentence, `options.${optionIndex}.sentence`),
      );
    }
  });

  if (candidate.options.length !== candidate.typeVersion.optionCount) {
    issues.push({ path: 'options', code: 'OPTION_COUNT_INVALID' });
  }
  if (candidate.options.filter((option) => option.isCorrect).length !== 1) {
    issues.push({ path: 'options', code: 'CORRECT_OPTION_COUNT_INVALID' });
  }
  if (!isTemplateValid(candidate)) {
    issues.push({ path: 'blocks', code: 'QUESTION_TEMPLATE_INVALID' });
  }

  const inline = candidate.typeVersion.template === 'INLINE_SPAN_CHOICE';
  const questionSentences = candidate.blocks
    .filter((block) => block.kind === 'QUESTION')
    .flatMap((block) => block.sentences.map(({ sentence }) => sentence));
  const spans = new Set<string>();
  candidate.options.forEach((option, optionIndex) => {
    if (!inline) {
      if (option.span !== null || option.sentence === null) {
        issues.push({
          path: `options.${optionIndex}.span`,
          code: 'INLINE_SPAN_INVALID',
        });
      }
      return;
    }
    if (option.sentence !== null) {
      issues.push({
        path: `options.${optionIndex}.span`,
        code: 'INLINE_SPAN_INVALID',
      });
      return;
    }
    const sentence = questionSentences.find(
      (candidateSentence) =>
        candidateSentence.id === option.span?.sentenceVersionId,
    );
    const span = option.span;
    const spanKey = span
      ? `${span.sentenceVersionId}:${span.startTokenIndex}:${span.endTokenIndex}`
      : '';
    if (
      !span ||
      !sentence ||
      !Number.isInteger(span.startTokenIndex) ||
      !Number.isInteger(span.endTokenIndex) ||
      span.startTokenIndex < 0 ||
      span.endTokenIndex <= span.startTokenIndex ||
      span.endTokenIndex > sentence.input.tokens.length ||
      spans.has(spanKey)
    ) {
      issues.push({
        path: `options.${optionIndex}.span`,
        code: 'INLINE_SPAN_INVALID',
      });
    }
    spans.add(spanKey);
  });
  if (inline && ![3, 4].includes(candidate.options.length)) {
    issues.push({ path: 'options', code: 'OPTION_COUNT_INVALID' });
  }

  return {
    status: issues.length === 0 ? 'PASSED' : 'FAILED',
    issues,
  };
};

/** 공개 계약과 분리된 canonical 콘텐츠 가져오기 내부 명령 구조를 정의한다 */

/** 기존 UUID 또는 같은 import의 성공 client ref 하나로 대상을 가리킨다 */
export type ContentDraftReference =
  { id: string; clientRef?: never } | { id?: never; clientRef: string };

/** 어휘 초안에 저장할 한국어 뜻 입력 */
export interface CanonicalDraftVocabularyMeaningInput {
  clientRef: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty?: number | null;
  contextNote?: string | null;
}

/** 어휘 초안에 저장할 발음과 음성 참조 입력 */
export interface CanonicalDraftVocabularyPronunciationInput {
  clientRef: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
}

/** 한 import item이 생성할 canonical 어휘 입력 */
export interface CanonicalDraftVocabularyInput {
  clientRef: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: CanonicalDraftVocabularyMeaningInput[];
  pronunciations: CanonicalDraftVocabularyPronunciationInput[];
}

/** 문장 원문 한 번의 어휘 출현 입력 */
export interface CanonicalDraftTokenInput {
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabulary: ContentDraftReference;
  meaning: ContentDraftReference;
  pronunciation: ContentDraftReference;
  contextMeaningKo: string;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING' | 'INSTRUCTION';
}

/** 여러 token에 걸친 공용 표현 참조 입력 */
export interface CanonicalDraftExpressionInput {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabulary: ContentDraftReference;
  meaning: ContentDraftReference;
  pronunciation: ContentDraftReference;
  contextMeaningKo: string;
  representative?: boolean;
}

/** 문제 block과 option이 공유하는 canonical 문장 입력 */
export interface CanonicalDraftSentenceInput {
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
  tokens: CanonicalDraftTokenInput[];
  expressions: CanonicalDraftExpressionInput[];
}

/** TTS 연결 전 생성 문제 DRAFT만 사용하는 nullable 음성 문장 입력 */
export interface GeneratedDraftSentenceInput extends Omit<
  CanonicalDraftSentenceInput,
  'mediaAssetId'
> {
  mediaAssetId: null;
}

/** 문제 화면을 순서대로 구성할 block 입력 */
export interface CanonicalDraftQuestionBlockInput {
  kind: 'INSTRUCTION' | 'PASSAGE' | 'DIALOGUE' | 'QUESTION' | 'EXPLANATION';
  displayMode: 'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO' | 'AUDIO_THEN_REVEAL';
  sentences: Array<{
    speaker?: string | null;
    sentence: CanonicalDraftSentenceInput;
  }>;
}

/** 문제 선택지의 client ref와 표시 순서 입력 */
interface CanonicalDraftQuestionOptionBase {
  clientRef: string;
  position: number;
}

/** 일반 선택지 문장 또는 문제 문장 inline 범위 중 하나인 canonical 입력 */
export type CanonicalDraftQuestionOptionInput =
  | (CanonicalDraftQuestionOptionBase & {
      sentence: CanonicalDraftSentenceInput;
      span: null;
    })
  | (CanonicalDraftQuestionOptionBase & {
      sentence: null;
      span: {
        blockPosition: number;
        sentencePosition: number;
        startTokenIndex: number;
        endTokenIndex: number;
      };
    });

/** 한 import item이 생성할 canonical 문제 입력 */
export interface CanonicalDraftQuestionInput {
  clientRef: string;
  questionTypeSlug: string;
  questionTypeVersion: number;
  difficulty: number;
  topicSlug?: string;
  tagSlugs?: string[];
  blocks: CanonicalDraftQuestionBlockInput[];
  options: CanonicalDraftQuestionOptionInput[];
  correctOptionRef: string;
}

/** item 저장과 같은 transaction에 남길 관리자 audit 문맥 */
export interface ContentDraftAuditContext {
  actorSub: string;
  actorUserId: string | null;
  requestId: string;
  occurredAt: Date;
}

/** 후속 question item만 사용하는 성공 item의 내부 참조 결과 */
export interface ContentDraftItemResult {
  targetId: string;
  referenceMap: Record<string, string>;
}

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

/** 한 import item이 생성할 canonical 어휘 입력 */
export interface CanonicalDraftVocabularyInput {
  clientRef: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: CanonicalDraftVocabularyMeaningInput[];
}

/** 문장 원문 한 번의 어휘 출현 입력 */
export interface CanonicalDraftTokenInput {
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabulary: ContentDraftReference;
  meaning: ContentDraftReference;
  contextMeaningKo: string;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING' | 'INSTRUCTION';
}

/** 여러 token에 걸친 공용 표현 참조 입력 */
export interface CanonicalDraftExpressionInput {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabulary: ContentDraftReference;
  meaning: ContentDraftReference;
  contextMeaningKo: string;
  representative?: boolean;
}

/** 문제 block과 option이 공유하는 canonical 문장 입력 */
export interface CanonicalDraftSentenceInput {
  originalText: string;
  translationKo: string;
  tokens: CanonicalDraftTokenInput[];
  expressions: CanonicalDraftExpressionInput[];
}

export type GeneratedDraftSentenceInput = CanonicalDraftSentenceInput;

/** item 저장과 같은 transaction에 남길 관리자 audit 문맥 */
export interface ContentDraftAuditContext {
  actorSub: string;
  actorUserId: string | null;
  requestId: string;
  occurredAt: Date;
}

/** 성공한 가져오기 항목의 내부 참조 결과 */
export interface ContentDraftItemResult {
  targetId: string;
  referenceMap: Record<string, string>;
}

/** 문장 안 공용 어휘 출현의 내부 projection */
export interface ThaiTokenProjection {
  position: number;
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabularyId: string;
  meaningId: string;
  contextMeaningKo: string;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING' | 'INSTRUCTION';
}

/** 문장 안 다단어 표현 범위의 내부 projection */
export interface ThaiExpressionProjection {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  meaningId: string;
  contextMeaningKo: string;
  representative: boolean;
}

/** 블록과 선택지가 같은 객체로 공유하는 불변 문장 projection */
export interface ThaiSentenceProjection {
  sentenceVersionId: string;
  originalText: string;
  translationKo: string;
  tokens: ThaiTokenProjection[];
  expressions: ThaiExpressionProjection[];
}

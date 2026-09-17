/** 문장 안 공용 어휘 출현의 내부 projection */
export interface LearnerQuestionTokenProjection {
  position: number;
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING' | 'INSTRUCTION';
}

/** 문장 안 다단어 표현 범위의 내부 projection */
export interface LearnerQuestionExpressionProjection {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  representative: boolean;
}

/** 블록과 선택지가 같은 객체로 공유하는 불변 문장 projection */
export interface LearnerQuestionSentenceProjection {
  sentenceVersionId: string;
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  tokens: LearnerQuestionTokenProjection[];
  expressions: LearnerQuestionExpressionProjection[];
}

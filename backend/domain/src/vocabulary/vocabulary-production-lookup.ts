/** AI 제작이 어휘 내부 구현 없이 exact·의심 중복을 조회하는 공개 port */

/** 기존 어휘의 중복 판정용 뜻 */
export interface VocabularyProductionMeaning {
  meaningKo: string;
}

/** MERGED 대표가 해소된 exact 어휘 */
export interface VocabularyProductionMatch {
  vocabularyId: string;
  meanings: readonly VocabularyProductionMeaning[];
}

/** 자동 병합하지 않고 관리자 판단 근거로만 쓰는 의심 중복 */
export interface VocabularyProductionSuspect {
  vocabularyId: string;
  normalizedThai: string;
  codePointDistance: number;
}

/** AI 어휘 제작이 요구하는 읽기 전용 어휘 경계 */
export interface VocabularyProductionLookup {
  findExact(normalizedThai: string): Promise<VocabularyProductionMatch | null>;
  findSuspected(input: {
    normalizedThai: string;
    maxCodePointDistance: number;
    limit: 5;
  }): Promise<VocabularyProductionSuspect[]>;
}

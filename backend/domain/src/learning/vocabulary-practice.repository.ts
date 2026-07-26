/** 단어 연습 source 조회·snapshot 저장·멱등 답안 transaction port를 정의한다 */

/** 단어 연습 출제 방식 */
export type PracticeMode =
  'THAI_TO_MEANING' | 'MEANING_TO_THAI' | 'AUDIO_TO_THAI' | 'AUDIO_TO_MEANING';

/** 단어 연습 생성 입력 */
export interface CreateVocabularyPracticeInput {
  userId: string;
  source:
    | { type: 'SEARCH_SELECTION'; vocabularyIds: string[] }
    | { type: 'WORDBOOK'; wordbookId: string };
  modes: PracticeMode[];
  questionCount: 10 | 20 | 'ALL';
  order: 'RANDOM' | 'SOURCE';
}

/** 응답 시 signed URL로 바꿀 발음 snapshot */
export interface PracticePronunciationSnapshot {
  id: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
  storageKey: string;
}

/** 콘텐츠 변경 뒤에도 학습 당시 표시를 보존하는 카드 snapshot */
export interface PracticeCardSnapshot {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: Array<{
    id: string;
    meaningKo: string;
    partOfSpeech: string;
    difficulty: number | null;
    contextNote: string | null;
  }>;
  pronunciations: PracticePronunciationSnapshot[];
  meaningPronunciations: Array<{
    meaningId: string;
    pronunciationId: string;
  }>;
}

/** 한 어의를 출제 후보로 표현한 source record */
export interface PracticeMeaningCandidate {
  vocabularyId: string;
  thai: string;
  meaningId: string;
  meaningKo: string;
  pronunciations: PracticePronunciationSnapshot[];
  card: PracticeCardSnapshot;
}

/** 소유권과 공개·음성 상태를 검증한 연습 source */
export interface PracticeSourceRecord {
  label: string;
  candidates: PracticeMeaningCandidate[];
}

/** DB에 고정 저장할 문항 선택지 */
export interface MaterializedPracticeOption {
  id: string;
  label: string;
}

/** 정답과 카드 snapshot을 포함한 서버 전용 materialized 문항 */
export interface MaterializedPracticeQuestion {
  id: string;
  sessionId: string;
  position: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string | null;
  mediaAssetId: string | null;
  mode: PracticeMode;
  prompt:
    { type: 'TEXT'; text: string } | { type: 'AUDIO'; storageKey: string };
  options: MaterializedPracticeOption[];
  correctOptionId: string;
  card: PracticeCardSnapshot;
}

/** 세션과 문항을 한 transaction으로 생성할 입력 */
export interface MaterializedPracticeSession {
  id: string;
  userId: string;
  sourceType: 'SEARCH_SELECTION' | 'WORDBOOK';
  sourceWordbookId: string | null;
  sourceLabel: string;
  modes: PracticeMode[];
  requestedQuestionCount: number | null;
  order: 'RANDOM' | 'SOURCE';
  questionCount: number;
  startedAt: Date;
  questions: MaterializedPracticeQuestion[];
}

/** append-only로 저장한 단어 연습 답안 */
export interface PracticeAnswerRecord {
  id: string;
  sessionId: string;
  questionId: string;
  userId: string;
  clientAnswerId: string;
  selectedOptionId: string;
  selectedLabelSnapshot: string;
  isCorrect: boolean;
  answeredAt: Date;
}

/** materialized 세션과 지금까지의 원시 답안을 함께 반환한다 */
export interface PracticeSessionRecord extends MaterializedPracticeSession {
  status: 'ACTIVE' | 'COMPLETED';
  completedAt: Date | null;
  answers: PracticeAnswerRecord[];
}

/** 답안 transaction에 필요한 사용자·문항·멱등 key */
export interface SubmitPracticeAnswerInput {
  userId: string;
  sessionId: string;
  questionId: string;
  clientAnswerId: string;
  selectedOptionId: string;
  answeredAt: Date;
}

/** 답안 transaction의 상태별 결과 */
export type SubmitPracticeAnswerResult =
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID_OPTION' }
  | { status: 'COMPLETED' }
  | {
      status: 'ANSWERED';
      answer: PracticeAnswerRecord;
      question: MaterializedPracticeQuestion;
      sessionCompleted: boolean;
    };

/** 단어 연습 답안 use case 입력 */
export type AnswerVocabularyPracticeInput = Omit<
  SubmitPracticeAnswerInput,
  'answeredAt'
>;

/** 단어 연습 source·세션·답안 원자성을 구현할 repository port */
export interface VocabularyPracticeRepository {
  loadSource(
    input: CreateVocabularyPracticeInput,
  ): Promise<PracticeSourceRecord | null>;
  createSession(
    input: MaterializedPracticeSession,
  ): Promise<PracticeSessionRecord>;
  getSession(
    userId: string,
    sessionId: string,
  ): Promise<PracticeSessionRecord | null>;
  submitAnswer(
    input: SubmitPracticeAnswerInput,
  ): Promise<SubmitPracticeAnswerResult>;
}

/** 콘텐츠 초안의 최신 참조 조회와 graph·item·audit 원자 저장 port를 정의한다 */
import type { MediaAsset } from '../media/media-asset.js';
import type {
  QuestionBlockKind,
  QuestionDisplayMode,
  QuestionTemplate,
} from '../questions/question-version.js';
import type {
  ThaiExpressionOccurrenceInput,
  ThaiTokenOccurrenceInput,
} from '../thai-content/thai-sentence-version.js';
import type { Vocabulary } from '../vocabulary/vocabulary.js';
import type { ContentDraftAuditContext } from './content-import.js';

/** 같은 import에서 성공한 vocabulary item의 비공개 reference map */
export interface ImportedVocabularyReferenceItem {
  itemId: string;
  clientRef: string;
  targetId: string;
  referenceMap: Record<string, string>;
}

/** token·expression이 참조할 공용 어휘의 현재 소유 정보 */
export interface VocabularyReferenceRecord {
  id: string;
  kind: Vocabulary['kind'];
  status: Vocabulary['status'];
}

/** token이 참조할 뜻의 현재 어휘 소유 정보 */
export interface VocabularyMeaningReferenceRecord {
  id: string;
  vocabularyId: string;
}

/** token이 참조할 발음의 현재 어휘·media 소유 정보 */
export interface VocabularyPronunciationReferenceRecord {
  id: string;
  vocabularyId: string;
  mediaAssetId: string | null;
}

/** slug와 version으로 고정한 문제 유형 버전의 현재 정보 */
export interface QuestionTypeVersionReferenceRecord {
  id: string;
  slug: string;
  version: number;
  template: QuestionTemplate;
  optionCount: number;
}

/** vocabulary graph에 저장할 한국어 뜻 */
export interface ResolvedVocabularyMeaning {
  id: string;
  vocabularyId: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number | null;
  contextNote: string | null;
}

/** vocabulary graph에 저장할 한국어 발음과 media 참조 */
export interface ResolvedVocabularyPronunciation {
  id: string;
  vocabularyId: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
}

/** 같은 vocabulary의 뜻과 발음을 잇는 resolved mapping */
export interface ResolvedVocabularyMeaningPronunciation {
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
}

/** adapter가 그대로 삽입할 canonical vocabulary draft graph */
export interface ResolvedVocabularyDraftGraph {
  vocabulary: Vocabulary;
  meanings: ResolvedVocabularyMeaning[];
  pronunciations: ResolvedVocabularyPronunciation[];
  meaningPronunciations: ResolvedVocabularyMeaningPronunciation[];
}

/** 문제 초안에 함께 생성할 논리 문장과 version 1 graph */
export interface ResolvedQuestionSentenceGraph {
  sentence: {
    id: string;
  };
  version: {
    id: string;
    sentenceId: string;
    version: 1;
    originalText: string;
    translationKo: string;
    pronunciationKo: string;
    toneMarks: string;
    mediaAssetId: string;
    frozenAt: null;
  };
  tokens: Array<
    ThaiTokenOccurrenceInput & {
      id: string;
      sentenceVersionId: string;
    }
  >;
  expressions: Array<
    Omit<ThaiExpressionOccurrenceInput, 'adminSelected'> & {
      id: string;
      sentenceVersionId: string;
      representative: boolean;
    }
  >;
}

/** 문제 version에 저장할 block과 문장 연결 */
export interface ResolvedQuestionBlock {
  id: string;
  questionVersionId: string;
  kind: QuestionBlockKind;
  displayMode: QuestionDisplayMode;
  position: number;
  sentences: Array<{
    id: string;
    blockId: string;
    sentenceVersionId: string;
    position: number;
    speaker: string | null;
  }>;
}

/** 문제 version에 저장할 선택지와 비공개 정답 */
export interface ResolvedQuestionOption {
  id: string;
  questionVersionId: string;
  sentenceVersionId: string | null;
  position: number;
  isCorrect: boolean;
  spanSentenceVersionId: string | null;
  spanStartTokenIndex: number | null;
  spanEndTokenIndex: number | null;
}

/** adapter가 그대로 삽입할 canonical question draft graph */
export interface ResolvedQuestionDraftGraph {
  question: {
    id: string;
    status: 'DRAFT';
    currentPublishedVersionId: null;
  };
  version: {
    id: string;
    questionId: string;
    version: 1;
    typeVersionId: string;
    difficulty: number;
    status: 'DRAFT';
    validationStatus: 'PENDING';
    validationIssues: [];
    validatedAt: null;
    publishedAt: null;
  };
  sentences: ResolvedQuestionSentenceGraph[];
  blocks: ResolvedQuestionBlock[];
  options: ResolvedQuestionOption[];
}

/** 성공한 import item의 내부 저장 표현 */
export interface ResolvedContentImportItem {
  id: string;
  importId: string;
  kind: 'VOCABULARY' | 'QUESTION';
  sourceIndex: number;
  clientRef: string;
  status: 'IMPORTED';
  targetId: string;
  errors: [];
  referenceMap: Record<string, string>;
}

/** 콘텐츠 생성과 같은 transaction에 append할 구조화 audit */
export interface ResolvedContentDraftAudit extends ContentDraftAuditContext {
  action:
    'CONTENT_VOCABULARY_DRAFT_IMPORTED' | 'CONTENT_QUESTION_DRAFT_IMPORTED';
  targetType: 'VOCABULARY' | 'QUESTION';
  targetId: string;
  summary: {
    importId: string;
    sourceIndex: number;
  };
}

/** 한 PostgreSQL transaction 안에서만 사용하는 lookup과 resolved insert */
export interface ContentDraftTransaction {
  findVocabularyByNormalizedThai(
    this: void,
    normalizedThai: string,
  ): Promise<string | null>;
  findMediaAssetById(
    this: void,
    mediaAssetId: string,
  ): Promise<MediaAsset | null>;
  findSuccessfulVocabularyImportItemsByReference(
    this: void,
    importId: string,
    clientRef: string,
  ): Promise<ImportedVocabularyReferenceItem[]>;
  findVocabularyById(
    this: void,
    vocabularyId: string,
  ): Promise<VocabularyReferenceRecord | null>;
  findVocabularyMeaningById(
    this: void,
    meaningId: string,
  ): Promise<VocabularyMeaningReferenceRecord | null>;
  findVocabularyPronunciationById(
    this: void,
    pronunciationId: string,
  ): Promise<VocabularyPronunciationReferenceRecord | null>;
  findQuestionTypeVersion(
    this: void,
    slug: string,
    version: number,
  ): Promise<QuestionTypeVersionReferenceRecord | null>;
  saveVocabularyDraft(
    this: void,
    input: {
      graph: ResolvedVocabularyDraftGraph;
      item: ResolvedContentImportItem;
      audit: ResolvedContentDraftAudit;
    },
  ): Promise<void>;
  saveQuestionDraft(
    this: void,
    input: {
      graph: ResolvedQuestionDraftGraph;
      item: ResolvedContentImportItem;
      audit: ResolvedContentDraftAudit;
    },
  ): Promise<void>;
}

/** local PostgreSQL과 Data API 구현이 동일한 item transaction을 제공한다 */
export interface ContentDraftRepository {
  runInTransaction<T>(
    this: void,
    work: (transaction: ContentDraftTransaction) => Promise<T>,
  ): Promise<T>;
}

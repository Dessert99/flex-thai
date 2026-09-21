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

/** vocabulary graph에 저장할 한국어 뜻 */
export interface ResolvedVocabularyMeaning {
  id: string;
  vocabularyId: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number | null;
  contextNote: string | null;
}

/** adapter가 그대로 삽입할 canonical vocabulary draft graph */
export interface ResolvedVocabularyDraftGraph {
  vocabulary: Vocabulary;
  meanings: ResolvedVocabularyMeaning[];
}

/** 성공한 import item의 내부 저장 표현 */
export interface ResolvedContentImportItem {
  id: string;
  importId: string;
  kind: 'VOCABULARY';
  sourceIndex: number;
  clientRef: string;
  status: 'IMPORTED';
  targetId: string;
  errors: [];
  referenceMap: Record<string, string>;
}

/** 콘텐츠 생성과 같은 transaction에 append할 구조화 audit */
export interface ResolvedContentDraftAudit extends ContentDraftAuditContext {
  action: 'CONTENT_VOCABULARY_DRAFT_IMPORTED';
  targetType: 'VOCABULARY';
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
  saveVocabularyDraft(
    this: void,
    input: {
      graph: ResolvedVocabularyDraftGraph;
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

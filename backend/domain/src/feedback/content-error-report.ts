/** 콘텐츠 오류 신고의 값과 workflow 불변식을 정의한다 */

/** 콘텐츠 오류 신고 처리 상태 */
export type ContentErrorReportStatus =
  'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
/** 콘텐츠 오류 신고 대상 종류 */
export type ContentErrorReportTargetKind =
  'QUESTION' | 'VOCABULARY' | 'SENTENCE' | 'AUDIO' | 'CONCEPT';
/** 콘텐츠 오류 신고 분류 */
export type ContentErrorReportCategory =
  | 'MEANING_TRANSLATION'
  | 'PRONUNCIATION_TONE'
  | 'AUDIO'
  | 'ANSWER_EXPLANATION'
  | 'TOKENIZATION'
  | 'OTHER';
/** 공개 화면에서 전달하는 대상 origin */
export type ContentErrorReportOrigin =
  | {
      kind: 'QUESTION';
      questionId: string;
      questionVersionId: string;
      blockId: string | null;
      sentenceVersionId: string | null;
    }
  | {
      kind: 'VOCABULARY';
      vocabularyId: string;
      meaningId: string | null;
      pronunciationId: string | null;
    }
  | {
      kind: 'SENTENCE';
      sentenceVersionId: string;
      tokenPosition: number | null;
    }
  | {
      kind: 'AUDIO';
      source:
        | { kind: 'VOCABULARY'; pronunciationId: string }
        | { kind: 'SENTENCE'; sentenceVersionId: string };
    }
  | {
      kind: 'CONCEPT';
      conceptId: string;
      conceptVersionId: string;
      blockId: string | null;
    };

/** 서버가 확정한 대상 식별자 */
export interface ContentErrorReportCanonicalReference {
  kind: ContentErrorReportTargetKind;
  contentId: string;
  contentVersionId: string | null;
  questionVersionId: string | null;
  sentenceVersionId: string | null;
  mediaAssetId: string | null;
  locationId: string | null;
}

/** 제출 당시 표시 문맥 */
export interface ContentErrorReportSnapshot {
  title: string;
  primaryText: string;
  secondaryText: string | null;
  versionLabel: string | null;
  locationLabel: string;
  audioAssetId: string | null;
}

/** 오류 신고 domain 실패 */
export class ContentErrorReportDomainError extends Error {
  constructor(
    readonly code:
      | 'CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE'
      | 'CONTENT_ERROR_REPORT_NOT_FOUND'
      | 'CONTENT_ERROR_REPORT_INVALID_TRANSITION'
      | 'CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE'
      | 'CONTENT_ERROR_REPORT_CONCURRENT_UPDATE',
  ) {
    super(code);
  }
}

const transitions: Record<
  ContentErrorReportStatus,
  readonly ContentErrorReportStatus[]
> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'REJECTED'],
  RESOLVED: ['OPEN'],
  REJECTED: ['OPEN'],
};

/** 허용된 상태 전이만 통과시킨다 */
export function assertContentErrorReportTransition(
  from: ContentErrorReportStatus,
  to: ContentErrorReportStatus,
): void {
  if (!transitions[from].includes(to)) {
    throw new ContentErrorReportDomainError(
      'CONTENT_ERROR_REPORT_INVALID_TRANSITION',
    );
  }
}

/** 선택 설명을 저장 형태로 정규화한다 */
export function normalizeContentErrorReportDescription(
  value: string | undefined,
): string | null {
  const normalized = value?.trim() ?? '';
  if (normalized.length > 1000) {
    throw new ContentErrorReportDomainError(
      'CONTENT_ERROR_REPORT_INVALID_TRANSITION',
    );
  }
  return normalized.length === 0 ? null : normalized;
}

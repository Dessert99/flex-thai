/** 신고 대상 소유 도메인의 기존 관리자 화면 deep-link를 계산한다 */
import type { ContentErrorReportTargetKind } from '@flex-thia/contracts';

/** 통합된 관리자 상세 화면이 있는 대상만 링크한다 */
export const toContentErrorReportTargetLink = (reference: {
  kind: ContentErrorReportTargetKind;
  contentId: string;
}): string | null => {
  if (reference.kind === 'QUESTION')
    return `/admin/questions/${reference.contentId}`;
  if (reference.kind === 'VOCABULARY')
    return `/admin/vocabularies/${reference.contentId}`;
  if (reference.kind === 'CONCEPT')
    return `/admin/concepts/${reference.contentId}`;
  return null;
};

/** 신고 대상 소유 도메인의 기존 관리자 화면 deep-link를 계산한다 */
import type { ContentErrorReportTargetKind } from '@flex-thia/contracts/feedback/content-error-reports';
import { linkOptions } from '@tanstack/react-router';

/** 통합된 관리자 상세 화면이 있는 대상만 링크한다 */
export const toContentErrorReportTargetLink = (reference: {
  kind: ContentErrorReportTargetKind;
  contentId: string;
}) => {
  if (reference.kind === 'QUESTION')
    return linkOptions({
      to: '/admin/questions/$questionId',
      params: { questionId: reference.contentId },
      search: { page: 1, pageSize: 20 },
    });
  if (reference.kind === 'VOCABULARY')
    return linkOptions({
      to: '/admin/vocabularies/$vocabularyId',
      params: { vocabularyId: reference.contentId },
      search: { page: 1, pageSize: 20 },
    });
  if (reference.kind === 'CONCEPT')
    return linkOptions({
      to: '/admin/concepts/$conceptId',
      params: { conceptId: reference.contentId },
    });
  return null;
};

/** 관리자 개념 초안 form을 서버 교체 계약으로 검증한다 */
import { replaceConceptVersionRequestSchema } from '@flex-thia/contracts';

/** 개념 초안 form 전체를 strict 교체 payload로 parse한다 */
export const conceptDraftFormSchema = replaceConceptVersionRequestSchema;

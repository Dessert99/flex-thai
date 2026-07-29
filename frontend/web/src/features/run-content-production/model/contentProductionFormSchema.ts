/** 콘텐츠 제작 form 입력을 공유 strict job 계약으로 검증한다 */
import { contentProductionJobConfigurationSchema } from '@flex-thia/contracts';

/** quick/advanced form이 제출 전에 사용하는 strict 구성 schema */
export const contentProductionFormSchema =
  contentProductionJobConfigurationSchema;

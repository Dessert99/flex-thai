/** 민감 route가 요구하는 관리자 step-up action을 metadata로 선언한다 */
import { SetMetadata } from '@nestjs/common';

/** 재사용 범위를 제한하는 민감 action category */
export type StepUpActionCategory =
  | 'AI_BULK_CREATE'
  | 'CONTENT_PUBLISH'
  | 'CONTENT_VISIBILITY'
  | 'ROLE_CHANGE'
  | 'PROVIDER_CONFIG';

/** step-up guard가 읽는 metadata key */
export const REQUIRED_STEP_UP_KEY = 'required-step-up';

/** 민감 route에 사용자·action-scoped grant를 요구한다 */
export const RequireStepUp = (action: StepUpActionCategory) =>
  SetMetadata(REQUIRED_STEP_UP_KEY, action);

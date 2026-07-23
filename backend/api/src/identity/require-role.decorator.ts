/** route가 요구하는 DB role을 metadata로 선언한다 */
import { SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';

/** role guard가 읽는 metadata key */
export const REQUIRED_ROLE_KEY = 'identity-required-role';

/** 민감 route가 요구하는 애플리케이션 role을 선언한다 */
export const RequireRole = (role: AuthenticatedUser['role']) =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

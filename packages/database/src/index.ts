/** Aurora Data API client factory를 패키지 공개 경계에 노출한다 */
export * from './clients/data-api.js';

/** 로컬 PostgreSQL client factory를 패키지 공개 경계에 노출한다 */
export * from './clients/local.js';

/** passwordless challenge repository adapter를 공개한다 */
export * from './repositories/drizzle-auth-challenge.repository.js';

/** 최초 ADMIN bootstrap transaction adapter를 공개한다 */
export * from './repositories/drizzle-admin-bootstrap.repository.js';

/** Drizzle Job repository adapter를 패키지 공개 경계에 노출한다 */
export * from './repositories/drizzle-job.repository.js';

/** 관리자 step-up repository adapter를 공개한다 */
export * from './repositories/drizzle-step-up.repository.js';

/** 안전한 upload lifecycle repository adapter를 공개한다 */
export * from './repositories/drizzle-upload.repository.js';

/** Cognito sub 기반 user repository adapter를 공개한다 */
export * from './repositories/drizzle-user.repository.js';

/** 기초 ERD schema를 패키지 공개 경계에 노출한다 */
export * from './schema/index.js';

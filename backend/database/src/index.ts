/** Aurora Data API client factory를 패키지 공개 경계에 노출한다 */
export * from './clients/data-api.js';

/** 로컬 PostgreSQL client factory를 패키지 공개 경계에 노출한다 */
export * from './clients/local.js';

/** 이메일 인증 challenge repository adapter를 공개한다 */
export * from './repositories/drizzle-auth-challenge.repository.js';

/** 최초 ADMIN bootstrap transaction adapter를 공개한다 */
export * from './repositories/drizzle-admin-bootstrap.repository.js';

/** Drizzle Job repository adapter를 패키지 공개 경계에 노출한다 */
export * from './repositories/drizzle-job.repository.js';

/** 학습 답안 transaction과 저장 콘텐츠 adapter를 공개한다 */
export * from './repositories/drizzle-learning.repository.js';

/** 문제 검증·게시·무효화 transaction adapter를 공개한다 */
export * from './repositories/drizzle-question-publication.repository.js';

/** 관리자 step-up repository adapter를 공개한다 */
export * from './repositories/drizzle-step-up.repository.js';

/** 안전한 upload lifecycle repository adapter를 공개한다 */
export * from './repositories/drizzle-upload.repository.js';

/** DB 최소 readiness query adapter를 공개한다 */
export * from './repositories/drizzle-readiness.probe.js';

/** 학습자 문제·해설·원시 풀이 기록 read model을 공개한다 */
export * from './queries/drizzle-learner-question.query.js';

/** Cognito sub 기반 user repository adapter를 공개한다 */
export * from './repositories/drizzle-user.repository.js';

/** 기초 ERD schema를 패키지 공개 경계에 노출한다 */
export * from './schema/index.js';

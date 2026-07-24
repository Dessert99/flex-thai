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

/** 관리자 audio media transaction repository를 공개한다 */
export * from './repositories/drizzle-media-admin.repository.js';

/** canonical 콘텐츠 draft transaction repository를 공개한다 */
export * from './repositories/drizzle-content-draft.repository.js';

/** 동기 콘텐츠 가져오기 멱등·완료 transaction repository를 공개한다 */
export * from './repositories/drizzle-content-import.repository.js';

/** 관리자 문제 초안 복제·전체 교체 transaction repository를 공개한다 */
export * from './repositories/drizzle-question-admin.repository.js';

/** 관리자 어휘 전체 교체·상태 전이 transaction repository를 공개한다 */
export * from './repositories/drizzle-vocabulary-admin.repository.js';

/** DB 최소 readiness query adapter를 공개한다 */
export * from './repositories/drizzle-readiness.probe.js';

/** 학습자 문제·해설·원시 풀이 기록 read model을 공개한다 */
export * from './queries/drizzle-learner-question.query.js';

/** 학습자 공용·저장 어휘와 관련 문제 read model을 공개한다 */
export * from './queries/drizzle-learner-vocabulary.query.js';

/** 관리자 media 상태와 발음·문장 사용처 read model을 공개한다 */
export * from './queries/drizzle-admin-media.query.js';

/** 전체 관리자 콘텐츠 가져오기 이력 read model을 공개한다 */
export * from './queries/drizzle-content-import.query.js';

/** 관리자 문제 모든 상태·버전 read model을 공개한다 */
export * from './queries/drizzle-admin-question.query.js';

/** 관리자 어휘 모든 상태·뜻·발음·사용처 read model을 공개한다 */
export * from './queries/drizzle-admin-vocabulary.query.js';

/** Cognito sub 기반 user repository adapter를 공개한다 */
export * from './repositories/drizzle-user.repository.js';

/** 기초 ERD schema를 패키지 공개 경계에 노출한다 */
export * from './schema/index.js';

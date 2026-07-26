/** 공유 요청과 응답 계약을 패키지 공개 경계에 노출한다 */
export * from './admin/index.js';
export * from './jobs.js';
export * from './common/problem.js';
export * from './health/status.js';
export * from './identity/auth.js';
export * from './identity/user-management.js';
export * from './learning/questions.js';
export * from './learning/vocabularies.js';
export * from './thai-content/sentences.js';

/** 콘텐츠 오류 신고 공개 계약을 노출한다 */
export * from './feedback/content-error-reports.js';

/** 사용자 단어장 HTTP 계약을 공개한다 */
export * from './learning/wordbooks.js';

/** 단어 연습 생성·진행·답안 계약을 공개한다 */
export * from './learning/vocabulary-practice.js';

/** 개념 학습 공개 계약을 패키지 경계에 노출한다 */
export * from './concepts/index.js';

/** 개인 추천 공개 계약을 패키지 경계에 노출한다 */
export * from './recommendations/recommendations.js';

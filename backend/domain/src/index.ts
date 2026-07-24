/** 이메일 인증과 step-up challenge 타입을 공개한다 */
export * from './auth/challenge.js';

/** 인증 외부 의존성 port를 공개한다 */
export * from './auth/challenge.repository.js';

/** 이메일 확인 후 비밀번호를 설정하는 인증 use case를 공개한다 */
export * from './auth/passwordless-auth.service.js';

/** 관리자 step-up use case를 공개한다 */
export * from './auth/step-up.service.js';

/** Cognito sub 기반 사용자 repository port를 공개한다 */
export * from './auth/user.repository.js';

/** Identity 인증 provider port와 결과 타입을 공개한다 */
export * from './identity/authentication.js';

/** 사전 준비 계정의 Identity 인증 use case를 공개한다 */
export * from './identity/authentication.service.js';

/** Identity 사용자 repository port를 공개한다 */
export * from './identity/user.repository.js';

/** idempotent Job 생성 use case를 패키지 공개 경계에 노출한다 */
export * from './jobs/create-job.service.js';

/** Job 도메인 타입을 패키지 공개 경계에 노출한다 */
export * from './jobs/job.js';

/** queue port를 패키지 공개 경계에 노출한다 */
export * from './jobs/job.queue.js';

/** Job repository port를 패키지 공개 경계에 노출한다 */
export * from './jobs/job.repository.js';

/** 태국어 어휘의 정확 중복과 검색을 위한 정규화를 공개한다 */
export * from './vocabulary/normalize-thai-search-text.js';

/** 공용 어휘의 생성·게시·숨김·복구 규칙을 공개한다 */
export * from './vocabulary/vocabulary.js';

/** upload repository port를 패키지 공개 경계에 노출한다 */
export * from './uploads/upload.repository.js';

/** 안전한 upload policy와 완료 검증 use case를 공개한다 */
export * from './uploads/upload-policy.service.js';

/** 음성 자산의 완료·거절·게시 준비 규칙을 공개한다 */
export * from './media/media-asset.js';

/** 관리자 음성 업로드 repository·storage port를 공개한다 */
export * from './media/media-admin.repository.js';

/** 관리자 음성 업로드 요청·완료 use case를 공개한다 */
export * from './media/media-admin.service.js';

/** 태국어 문장 버전의 Unicode offset·표현·동결 규칙을 공개한다 */
export * from './thai-content/thai-sentence-version.js';

/** 문제 버전의 구조와 최신 게시 콘텐츠 검증을 공개한다 */
export * from './questions/question-version.js';

/** 문제 게시 transaction port를 공개한다 */
export * from './questions/question-publication.repository.js';

/** 문제 게시와 노출 상태 수명 use case를 공개한다 */
export * from './questions/question-publication.js';

/** 답안 transaction 저장소 port를 공개한다 */
export * from './learning/question-attempt.repository.js';

/** 답안 append-only 수명과 학습자 오류를 공개한다 */
export * from './learning/question-attempt.js';

/** 저장 문제·어휘 repository port를 공개한다 */
export * from './learning/saved-content.repository.js';

/** 저장 문제·어휘의 가용성 use case를 공개한다 */
export * from './learning/saved-content.js';

/** private media 읽기 URL provider port를 공개한다 */
export * from './media/media-read-url.provider.js';

/** canonical 콘텐츠 가져오기 내부 명령 구조를 공개한다 */
export * from './content-import/content-import.js';

/** 콘텐츠 초안의 current lookup·원자 저장 port를 공개한다 */
export * from './content-import/content-draft.repository.js';

/** canonical 어휘·문제 초안 생성 use case를 공개한다 */
export * from './content-import/content-draft.js';

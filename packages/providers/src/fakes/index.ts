/** fake 이메일 challenge와 step-up repository를 공개한다 */
export * from './fake-challenge.repository.js';

/** 비밀번호 원문을 저장하지 않는 fake identity provider를 공개한다 */
export * from './fake-identity-provider.js';

/** 사전 준비 계정의 비밀번호·TOTP·refresh fake를 공개한다 */
export * from '../identity/fake-authentication.provider.js';

/** fake Cognito 전화번호 검증 provider를 공개한다 */
export * from './fake-phone-verification.provider.js';

/** in-memory Job queue를 테스트와 로컬 개발에 노출한다 */
export * from './fake-job.queue.js';

/** in-memory Job repository를 테스트와 로컬 개발에 노출한다 */
export * from './fake-job.repository.js';

/** in-memory upload repository를 테스트와 로컬 개발에 노출한다 */
export * from './fake-upload.repository.js';

/** fake upload policy와 inspection provider를 공개한다 */
export * from './fake-upload.provider.js';

/** fake SMS sender를 공개한다 */
export * from './fake-sms-sender.js';

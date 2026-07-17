/** Cognito passwordless identity adapter를 공개한다 */
export * from './aws/cognito-identity.provider.js';

/** SES passwordless challenge sender를 공개한다 */
export * from './aws/ses-challenge.sender.js';

/** SNS 관리자 OTP sender를 공개한다 */
export * from './aws/sns-sms.sender.js';

/** SQS Job queue adapter를 production 조립 경계에 노출한다 */
export * from './aws/sqs-job.queue.js';

/** challenge HMAC과 session 암호화 adapter를 공개한다 */
export * from './crypto/challenge-crypto.js';

/** AWS를 호출하지 않는 로컬·테스트 adapter를 공개한다 */
export * from './fakes/index.js';

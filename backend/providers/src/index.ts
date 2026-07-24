/** Cognito 비밀번호 identity adapter를 공개한다 */
export * from './aws/cognito-identity.provider.js';

/** Cognito 전화번호 검증 adapter를 공개한다 */
export * from './aws/cognito-phone-verification.provider.js';

/** private S3 upload policy와 object inspector를 공개한다 */
export * from './aws/s3-upload.provider.js';

/** SES 이메일 인증 코드 sender를 공개한다 */
export * from './aws/ses-challenge.sender.js';

/** SNS 관리자 OTP sender를 공개한다 */
export * from './aws/sns-sms.sender.js';

/** Parameter Store 기반 이메일 challenge 상한 provider를 공개한다 */
export * from './aws/ssm-challenge-limit.provider.js';

/** 전체 인증 상한 도달 SNS 알림 adapter를 공개한다 */
export * from './aws/sns-security-alert.js';

/** SQS Job queue adapter를 production 조립 경계에 노출한다 */
export * from './aws/sqs-job.queue.js';

/** challenge HMAC adapter를 공개한다 */
export * from './crypto/challenge-crypto.js';

/** Cognito 비밀번호·TOTP 인증 adapter를 공개한다 */
export * from './identity/cognito-authentication.provider.js';

/** local Identity 인증 adapter를 공개한다 */
export * from './identity/fake-authentication.provider.js';

/** private CloudFront media read URL signer를 공개한다 */
export * from './storage/cloudfront-media-read-url.provider.js';

/** AWS를 호출하지 않는 로컬·테스트 adapter를 공개한다 */
export * from './fakes/index.js';

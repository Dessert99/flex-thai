/** Cognito 전화번호 검증 adapter를 공개한다 */
export * from './aws/cognito-phone-verification.provider.js';

/** private S3 upload policy와 object inspector를 공개한다 */
export * from './aws/s3-upload.provider.js';

/** SNS 관리자 OTP sender를 공개한다 */
export * from './aws/sns-sms.sender.js';

/** SQS Job queue adapter를 production 조립 경계에 노출한다 */
export * from './aws/sqs-job.queue.js';

/** challenge HMAC adapter를 공개한다 */
export * from './crypto/challenge-crypto.js';

/** Cognito TOTP·refresh 인증 adapter를 공개한다 */
export * from './identity/cognito-authentication.provider.js';

/** Cognito CUSTOM_AUTH passwordless adapter를 공개한다 */
export * from './identity/cognito-passwordless-authentication.provider.js';

/** local passwordless Identity 인증 adapter를 공개한다 */
export * from './identity/fake-passwordless-authentication.provider.js';

/** SES passwordless code·link sender를 공개한다 */
export * from './messaging/ses-email-challenge.sender.js';

/** private CloudFront media read URL signer를 공개한다 */
export * from './storage/cloudfront-media-read-url.provider.js';

/** private audio S3 upload와 hash inspection adapter를 공개한다 */
export * from './storage/audio-upload.provider.js';

/** AWS를 호출하지 않는 로컬·테스트 adapter를 공개한다 */
export * from './fakes/index.js';

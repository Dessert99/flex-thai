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

/** 검증된 S3 콘텐츠 제작 입력 reader를 공개한다 */
export * from './storage/s3-content-production-input.reader.js';

/** 운영 개념 외부 검증 미구성 adapter를 공개한다 */
export * from './validation/unavailable-concept-content.validator.js';

/** AWS를 호출하지 않는 로컬·테스트 adapter를 공개한다 */
export * from './fakes/index.js';

/** AI 어휘 제작의 local input reader를 공개한다 */
export * from './fakes/fake-content-input.provider.js';

/** AI 어휘 제작의 local OCR provider를 공개한다 */
export * from './fakes/fake-content-ocr.provider.js';

/** AI 어휘 제작의 local 추출 provider를 공개한다 */
export * from './fakes/fake-vocabulary-extraction.provider.js';

/** AI 어휘 제작의 local 교차 검증 provider를 공개한다 */
export * from './fakes/fake-vocabulary-cross-validation.provider.js';

/** AI 문제 제작의 local 생성 provider를 공개한다 */
export * from './fakes/fake-question-generation.provider.js';

/** AI 문제 제작의 local 교차 검증 provider를 공개한다 */
export * from './fakes/fake-question-cross-validation.provider.js';

/** 외부 호출 없이 결정적인 WAV를 만드는 TTS provider를 공개한다 */
export * from './fakes/deterministic-tts.provider.js';

/** 자동 TTS object 저장소를 메모리에서 검증하는 fake를 공개한다 */
export * from './fakes/fake-tts-audio.store.js';

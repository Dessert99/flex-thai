/** SQS Job queue adapter를 production 조립 경계에 노출한다 */
export * from './aws/sqs-job.queue.js';

/** AWS를 호출하지 않는 로컬·테스트 adapter를 공개한다 */
export * from './fakes/index.js';

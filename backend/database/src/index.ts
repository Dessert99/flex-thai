/** Aurora Data API client factory를 패키지 공개 경계에 노출한다 */
export * from './clients/data-api.js';

/** 로컬 PostgreSQL client factory를 패키지 공개 경계에 노출한다 */
export * from './clients/local.js';

/** passwordless 이메일 challenge repository adapter를 공개한다 */
export * from './repositories/drizzle-email-challenge.repository.js';

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

/** 자동 TTS 작업·cache transaction repository를 공개한다 */
export * from './repositories/tts/drizzle-tts.repository.js';

/** TTS provider 실행 exact-once와 orphan audio GC 저장소를 공개한다 */
export * from './repositories/tts/drizzle-tts-durability.repository.js';

/** canonical 콘텐츠 draft transaction repository를 공개한다 */
export * from './repositories/drizzle-content-draft.repository.js';

/** 동기 콘텐츠 가져오기 멱등·완료 transaction repository를 공개한다 */
export * from './repositories/drizzle-content-import.repository.js';

/** 관리자 문제 초안 복제·전체 교체 transaction repository를 공개한다 */
export * from './repositories/drizzle-question-admin.repository.js';

/** 문제 분류 설정 lifecycle adapter를 공개한다 */
export * from './repositories/drizzle-question-taxonomy.repository.js';

/** 관리자 어휘 전체 교체·상태 전이 transaction repository를 공개한다 */
export * from './repositories/drizzle-vocabulary-admin.repository.js';

/** DB 최소 readiness query adapter를 공개한다 */
export * from './repositories/drizzle-readiness.probe.js';

/** 학습자 문제·해설·원시 풀이 기록 read model을 공개한다 */
export * from './queries/drizzle-learner-question.query.js';

/** 학습자 공용·저장 어휘와 관련 문제 read model을 공개한다 */
export * from './queries/drizzle-learner-vocabulary.query.js';

/** 사용자 단어장 검색 read model을 공개한다 */
export * from './queries/drizzle-wordbook.query.js';

/** 사용자 단어장 원자 write adapter를 공개한다 */
export * from './repositories/drizzle-wordbook.repository.js';

/** 단어 연습 source·세션 read model을 공개한다 */
export * from './queries/drizzle-vocabulary-practice.query.js';

/** 단어 연습 세션·답안 transaction adapter를 공개한다 */
export * from './repositories/drizzle-vocabulary-practice.repository.js';

/** 관리자 media 상태와 발음·문장 사용처 read model을 공개한다 */
export * from './queries/drizzle-admin-media.query.js';

/** 자동 TTS 작업·항목 운영 read model을 공개한다 */
export * from './queries/drizzle-tts-operations.query.js';

/** 전체 관리자 콘텐츠 가져오기 이력 read model을 공개한다 */
export * from './queries/drizzle-content-import.query.js';

/** 관리자 문제 모든 상태·버전 read model을 공개한다 */
export * from './queries/drizzle-admin-question.query.js';

/** 관리자 문제 분류 설정 read model을 공개한다 */
export * from './queries/drizzle-question-taxonomy.query.js';

/** 관리자 어휘 모든 상태·뜻·발음·사용처 read model을 공개한다 */
export * from './queries/drizzle-admin-vocabulary.query.js';

/** 관리자 사용자 목록·상태·beta 안내 추적 adapter를 공개한다 */
export * from './queries/drizzle-user-management.query.js';

/** 관리자 감사 기록 read adapter를 공개한다 */
export * from './queries/drizzle-audit-log.query.js';

/** Cognito sub 기반 user repository adapter를 공개한다 */
export * from './repositories/drizzle-user.repository.js';

/** 기초 ERD schema를 패키지 공개 경계에 노출한다 */
export * from './schema/index.js';

/** 관리자 개념 수명주기 adapter를 공개한다 */
export * from './repositories/drizzle-concept-admin.repository.js';

/** 학습자 게시 개념 read model을 공개한다 */
export * from './queries/drizzle-learner-concept.query.js';

/** 관리자 모든 상태 개념 read model을 공개한다 */
export * from './queries/drizzle-admin-concept.query.js';

/** 개념 학습 화면의 콘텐츠 오류 신고 target lookup을 공개한다 */
export * from './queries/drizzle-concept-error-report-target.lookup.js';

/** 콘텐츠 오류 신고 transaction adapter를 공개한다 */
export * from './repositories/drizzle-content-error-report.repository.js';

/** 콘텐츠 오류 신고 관리자 query를 공개한다 */
export * from './queries/drizzle-content-error-report.query.js';

/** 원시 기록 기반 개인 추천 read model을 공개한다 */
export * from './queries/drizzle-recommendation.query.js';

/** 콘텐츠 제작 작업과 preset의 PostgreSQL adapter를 공개한다 */
export * from './repositories/content-production/drizzle-content-production.repository.js';

/** AI 어휘 후보와 provider 실행 adapter를 공개한다 */
export * from './repositories/content-production/drizzle-ai-vocabulary-production.repository.js';

/** AI 어휘 제작용 exact·의심 중복 조회 adapter를 공개한다 */
export * from './queries/drizzle-vocabulary-production.lookup.js';

/** AI 문제 후보·검증·승인 transaction adapter를 공개한다 */
export * from './repositories/content-production/drizzle-ai-question-production.repository.js';

/** AI 문제 생성 prompt context read model을 공개한다 */
export * from './queries/drizzle-question-production-context.query.js';

/** 현재 게시 문제의 결정적 유사도 lookup을 공개한다 */
export * from './queries/drizzle-published-question-similarity.lookup.js';

/** AI 문제 후보 운영 목록·상세 read model을 공개한다 */
export * from './queries/drizzle-question-candidate.query.js';

/** AI 어휘 후보 운영 목록·상세 read model을 공개한다 */
export * from './queries/content-production/drizzle-vocabulary-candidate.query.js';

/** AI 어휘 후보 resolution과 DRAFT graph transaction adapter를 공개한다 */
export * from './repositories/content-production/drizzle-vocabulary-candidate-review.repository.js';

/** 생성 문제의 nullable-audio DRAFT graph writer를 공개한다 */
export * from './repositories/content-production/drizzle-generated-question-draft.repository.js';

/** 생성 문제 승인 transaction의 초기 TTS scheduler를 공개한다 */
export * from './repositories/content-production/drizzle-generated-question-tts.scheduler.js';

/** 콘텐츠 제작·TTS 공용 durable outbox writer와 lease repository를 공개한다 */
export * from './repositories/dispatch/drizzle-async-dispatch-outbox.repository.js';

/** TTS 성공 transaction의 immutable target attachment writer를 공개한다 */
export * from './repositories/tts/drizzle-tts-target-attachment.repository.js';

/** 문제 게시 전 필수 TTS target readiness query를 공개한다 */
export * from './queries/drizzle-content-tts-readiness.query.js';

/** TTS retry 상태와 durable dispatch를 원자화하는 coordinator를 공개한다 */
export * from './repositories/tts/drizzle-tts-retry-coordinator.js';

/** TTS voice preset 목록·상세 read model을 공개한다 */
export * from './queries/drizzle-tts-voice-preset.query.js';

/** immutable TTS voice preset command repository를 공개한다 */
export * from './repositories/tts/drizzle-tts-voice-preset.repository.js';

/** AI·TTS 운영 비용 aggregate read model을 공개한다 */
export * from './queries/drizzle-usage-cost-operations.query.js';

/** 운영 비용 경고 singleton repository를 공개한다 */
export * from './repositories/drizzle-operations-cost-settings.repository.js';

# FLEX THIA Backend MVP Delivery Roadmap

**Source specification:**
`docs/superpowers/specs/2026-07-23-backend-mvp-domain-erd-api-design.md`

**Purpose:** 승인된 백엔드 MVP를 한 번에 크게 변경하지 않고, 각 단계가
독립적으로 테스트와 리뷰가 가능한 구현 계획으로 나눈다.

## 공통 원칙

- 구현 순서는 의존성이 적은 기반에서 사용자 흐름으로 진행한다.
- 각 단계는 필요한 파일과 migration만 추가한다.
- 기존 PDF·AI·TTS Job과 공개 가입·SMS 인증 경로는 새 MVP 실행 경로에서
  격리하되, 관련 인프라 자원은 이 로드맵에서 삭제하지 않는다.
- 브라우저·API E2E 테스트는 만들지 않는다.
- 모든 테스트 설명은 한국어로 작성한다.
- 새 코드와 변경 코드는 `conventions/comment-convention.md`를 따른다.
- 배포와 Lambda DI metadata 문제는 애플리케이션 구현과 분리한다.

## 단계

| 단계 | 산출물 | 선행 단계 |
| --- | --- | --- |
| 1. Identity와 인증 계약 | 로그인·TOTP·refresh·logout·역할 상속의 애플리케이션 구현 | 없음 |
| 2. 어휘·문장·음성 기반 | `vocabulary`, `thai-content`, `media` domain과 schema | 1 |
| 3. 문제·버전·게시 | 문제 유형, 불변 버전, 블록, 검증과 게시 transaction | 2 |
| 4. 학습자 흐름 | 문제 조회, 첫 답·재시도, 저장 문제·어휘, 오답 필터 | 3 |
| 5. 콘텐츠 가져오기와 관리자 API | 음성 업로드, 정규 JSON, 항목별 초안, 관리자 게시 API | 3 |
| 6. MVP 통합 정리 | 비활성 legacy 경로 격리 확인, 계약 누락·보안 회귀 점검 | 4, 5 |

4단계와 5단계는 3단계 이후 서로 독립적으로 진행할 수 있다.

## 인프라 재개 시 별도 계획

애플리케이션 계획은 인프라 코드와 배포를 변경하지 않는다. 실제 운영
연결 전에는 별도 설계·계획으로 다음을 처리한다.

- `/api/v1` API Gateway route와 공개·보호 authorizer 경계
- Cognito access token 15분, refresh token 7일
- refresh token rotation과 10초 grace period
- Cognito TOTP 활성화와 관리자 preference
- 로그인·MFA route별 throttling과
  `cognito-idp:AdminRespondToAuthChallenge` 권한
- 사용하지 않는 signup·SMS·입력 자료 권한과 환경 변수 정리
- API Lambda NestJS dependency injection metadata 문제 해결

## 계획 문서

- 1단계:
  `docs/superpowers/plans/2026-07-23-identity-auth-mvp.md`
- 2단계 이후 계획은 직전 단계가 리뷰를 통과한 뒤 해당 시점의 실제 schema와
  공개 interface를 기준으로 작성한다.

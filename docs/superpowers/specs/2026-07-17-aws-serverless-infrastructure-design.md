# FLEX THIA AWS 서버리스 인프라·프로젝트 아키텍처 설계

- 작성일: 2026-07-17
- 상태: 사용자 승인
- 선행 문서:
  [`2026-07-16-thai-flex-learning-service-design.md`](./2026-07-16-thai-flex-learning-service-design.md)
- 대상: 인프라, 공통 프로젝트 구조, 후속 백엔드·프론트엔드 구현 계획의 기준

## 1. 문서 목적

이 문서는 통합 제품 기획에서 후속 단계로 남겨 둔 인프라와 프로젝트
아키텍처를 확정한다.

이 문서가 결정하는 범위는 다음과 같다.

- AWS 배포 구조와 리전
- 프론트엔드, API, 비동기 작업의 실행 환경
- 인증·인가와 관리자 추가 인증의 기반
- DB, ORM, 검색, 캐시
- 원본 파일과 생성 음성 저장
- AI·OCR·검증·TTS Provider 경계
- 큐, 워크플로, 재시도, 중복 방지
- 비밀, 네트워크, 관측, 비용 방어선
- CDK 스택과 배포 방식
- 모노레포 애플리케이션·패키지 경계
- 구현 단계의 검증 원칙

이 문서는 구현 계획이 아니다. 승인 후 별도 백엔드 구현 계획을 작성하고,
그 계획에서 ERD, API 계약, NestJS 모듈과 구현 순서를 정한다.

## 2. 현재 전제

### 2.1 사용량

- 초기 주 사용자는 서비스 소유자 한 명이다.
- 학교 이메일을 인증할 수 있는 사용자가 가입할 수 있는 제품 경계는 유지한다.
- 일반 학습 API 트래픽은 초기에는 작다.
- AI 어휘 이식, 문항 생성, 검증, TTS 작업은 짧은 시간에 몰릴 수 있다.
- 월간 원본 수나 페이지 수를 아키텍처 전제로 고정하지 않는다.
- AI 작업량은 Provider별 실행 기록과 비용을 측정한 뒤 운영 한도를 조정한다.

### 2.2 우선순위

1. 콘텐츠와 사용자 데이터의 안전성
2. AI 작업의 중복 과금과 부분 실패 방지
3. 사용하지 않을 때 줄어드는 고정비
4. 한 사람이 운영할 수 있는 단순성
5. 공급자와 실행 환경을 실측 후 교체할 수 있는 경계

### 2.3 비목표

- 다중 리전 액티브-액티브
- Kubernetes
- 초기 마이크로서비스 분리
- 초기 Redis·ElastiCache
- 초기 OpenSearch
- 초기 WebSocket
- 상시 실행 EC2·ECS Service·App Runner
- 클라우드 상시 staging 환경
- 브라우저·API 통합 E2E 테스트

## 3. 최종 결정 요약

| 영역 | 결정 |
| --- | --- |
| 아키텍처 | AWS 서버리스 모듈러 모놀리스 |
| 주 리전 | 서울 `ap-northeast-2` |
| 글로벌 예외 | Web S3와 CloudFront용 ACM 관리 Stack은 `us-east-1`, CloudFront와 Route 53은 글로벌 |
| 프론트엔드 | Vite 빌드 → 비공개 S3 → CloudFront |
| API | API Gateway HTTP API → NestJS Lambda |
| 짧은 작업 | TypeScript Lambda |
| 긴 작업 | 실측상 단일 실행이 15분을 넘을 때만 ECS/Fargate Task |
| DB | Aurora PostgreSQL Serverless v2 |
| DB 접근 | RDS Data API |
| ORM | Drizzle ORM의 AWS Data API PostgreSQL 드라이버 |
| 검색 | PostgreSQL 정규화 컬럼과 인덱스, 외부 검색 엔진 없음 |
| 앱 캐시 | 없음, TanStack Query와 CloudFront 캐시만 사용 |
| 파일·음성 | 용도별 비공개 S3 버킷 |
| 인증 | Cognito User Pool 사용자 지정 이메일 challenge |
| 이메일 | SES |
| 관리자 OTP | SNS SMS와 애플리케이션 step-up challenge |
| API 인증 | API Gateway JWT Authorizer와 Cognito access token |
| 비동기 큐 | SQS Standard Queue와 DLQ |
| 워크플로 | Step Functions Standard Workflow |
| AI 연동 | OCR·생성·검증·TTS Provider Adapter |
| 관측 | CloudWatch Logs, Metrics, Alarms |
| 비밀 | Secrets Manager |
| 일반 설정 | Systems Manager Parameter Store |
| 네트워크 | Aurora만 사설 VPC, Lambda는 초기 VPC 밖에서 Data API 사용 |
| 인터넷 출구 | NAT Gateway 초기 미사용 |
| 인프라 코드 | AWS CDK v2, TypeScript |
| 배포 환경 | 로컬 + AWS production 하나 |
| CI/CD | GitHub Actions OIDC, 초기 production 배포는 수동 승인 |

## 4. 검토한 대안

### 4.1 선택: 서버리스 모듈러 모놀리스

구성:

- S3 + CloudFront
- API Gateway + Lambda
- Aurora Serverless v2 + Data API
- Cognito + SES + SNS
- SQS + Step Functions + Lambda
- 필요한 긴 작업만 Fargate

선택 이유:

- 일반 트래픽이 작을 때 API와 작업 컴퓨팅 비용이 거의 발생하지 않는다.
- AI 작업이 몰리면 큐와 동시성 제한으로 속도를 통제할 수 있다.
- 운영체제, 상시 서버, 컨테이너 클러스터를 관리하지 않는다.
- 모듈러 모놀리스로 도메인 경계는 유지하면서 배포 복잡성을 낮춘다.

수용할 단점:

- Lambda와 Aurora 재개에 콜드 스타트가 있다.
- Cognito 사용자 지정 인증 구현이 기본 비밀번호 인증보다 복잡하다.
- Lambda 단일 실행은 15분을 넘을 수 없다.
- AWS 서비스 간 장애 추적을 위해 구조화 로그와 실행 ID가 필요하다.

### 4.2 미선택: App Runner API + 서버리스 작업

장점:

- NestJS 컨테이너 서버 모델이 익숙하다.
- Lambda HTTP 어댑터와 콜드 스타트 제약이 적다.

미선택 이유:

- 저트래픽이어도 최소 프로비저닝 비용이 남을 수 있다.
- 큐, DB, 인증, 파일 저장은 어차피 별도 서비스가 필요하다.
- 초기 한 명의 일반 API 트래픽에는 상시 API 프로세스가 과하다.

전환 조건:

- API 트래픽이 꾸준해지고 Lambda 지연이나 실행 제약이 실측상 문제가 된다.

### 4.3 미선택: ECS/Fargate + 프로비저닝 RDS

장점:

- 전통적인 서버와 DB 운영 모델이라 예측하기 쉽다.
- 장시간 실행과 연결 풀 사용이 자연스럽다.

미선택 이유:

- 서비스가 사용되지 않아도 컴퓨팅과 DB 비용이 계속 발생한다.
- 네트워크, 로드 밸런서, 컨테이너 이미지, 배포 운영 범위가 넓다.
- 현재 사용량에 비해 운영 요소가 많다.

전환 조건:

- 일정한 부하가 생겨 고정 인스턴스가 더 저렴해진다.
- 다수 작업이 Lambda 한계를 넘어 Fargate가 기본 실행 환경이 된다.

## 5. 전체 실행 구조

```text
사용자 브라우저
│
├─ Route 53 ─ ACM ─ CloudFront
│                    ├─ 비공개 Web S3: Vite 정적 파일
│                    └─ 비공개 Media S3: 허가된 음성 전달
│
├─ Cognito User Pool
│   ├─ Custom Auth Lambda triggers
│   └─ SES: 이메일 링크 + 6자리 코드
│
├─ SNS SMS: 관리자 step-up OTP
│
└─ API Gateway HTTP API
    ├─ JWT Authorizer
    └─ NestJS API Lambda
        ├─ RDS Data API ─ Aurora PostgreSQL Serverless v2
        ├─ Private Input S3
        ├─ Private Media S3
        └─ SQS Standard Queue
            └─ Job Starter Lambda
                └─ Step Functions Standard Workflow
                    ├─ OCR task Lambda
                    ├─ Generation task Lambda
                    ├─ Deterministic validation Lambda
                    ├─ Independent verification Lambda
                    ├─ TTS task Lambda
                    └─ 조건 충족 시 ECS/Fargate Task

공통
├─ IAM: 최소 권한
├─ Secrets Manager: DB·Provider 자격 증명
├─ Parameter Store: 환경 설정
├─ CloudWatch: 로그·지표·알람
└─ CDK → CloudFormation: 생성·변경·삭제
```

## 6. 프로젝트와 애플리케이션 경계

### 6.1 모노레포

초기 구조는 pnpm workspace를 사용한다. 별도 모노레포 오케스트레이터는
필요가 확인되기 전까지 추가하지 않는다.

```text
backend/
├─ api/         NestJS HTTP API와 Lambda entrypoint
├─ worker/      비동기 Lambda entrypoint와 Fargate command
├─ domain/      AWS에 의존하지 않는 도메인 규칙과 상태 전이
├─ database/    Drizzle schema, repository, migration
├─ providers/   OCR·생성·검증·TTS port와 adapter
└─ config/      환경 변수·Parameter Store 설정 검증

frontend/
└─ web/         Vite, Tailwind CSS, shadcn, TanStack Query

shared/
└─ contracts/   공유 스키마, API·작업 payload 타입

infra/          AWS CDK v2 TypeScript
```

최상위 제품 영역은 `backend`, `frontend`, `shared`로 구분하고 실행
프로그램과 지원 workspace를 각 영역 바로 아래에 둔다.

### 6.2 의존성 방향

- `domain`은 AWS SDK, NestJS, Drizzle을 import하지 않는다.
- `contracts`는 직렬화 가능한 스키마만 제공한다.
- `database`와 `providers`는 `domain`이 정의한 port를 구현한다.
- `api`와 `worker`는 애플리케이션 흐름을 조립한다.
- `web`은 백엔드 내부 모듈을 import하지 않고 공개 contract만 사용한다.
- `infra`는 애플리케이션 소스의 도메인 규칙을 import하지 않는다.

### 6.3 배포 단위

- Web 정적 자산
- API Lambda
- Cognito custom challenge Lambda 세 개
- Job Starter Lambda
- 작업 유형별 Lambda
- Step Functions state machine
- 조건부 Fargate task definition
- DB migration command

코드 저장소는 하나지만 장애와 동시성은 배포 단위별로 격리한다.

## 7. AWS 계정, 환경, 리전

### 7.1 환경

- 로컬 개발 환경
- AWS production 환경

상시 AWS staging은 만들지 않는다. AWS 통합 확인이 꼭 필요한 경우에만
짧게 유지하는 임시 stack을 만들고 검증 후 제거한다.

### 7.2 계정 접근

- AWS root 사용자는 MFA를 설정하고 일상 작업에 사용하지 않는다.
- 사람의 AWS 접근은 장기 access key 대신 임시 자격 증명을 사용한다.
- GitHub Actions는 OIDC로 배포 role을 assume한다.
- 프론트엔드와 저장소에 AWS 장기 access key를 두지 않는다.

### 7.3 리전

- 애플리케이션, Cognito, SES, SNS, Lambda, SQS, Step Functions, Aurora:
  `ap-northeast-2`
- 정적 Web S3와 CloudFront용 ACM 인증서: `us-east-1`
- CloudFront: 글로벌
- Route 53: 글로벌

서비스가 서울 리전에서 해당 기능과 엔진 버전을 지원하는지는 CDK 구현 전
한 번 더 확인한다. 지원되지 않는 최신 부가 기능보다 검증된 호환 조합을
선택한다.

### 7.4 도메인

실제 루트 도메인은 배포 설정 값으로 받는다.

- Canonical Web: `www.<root-domain>`
- Web redirect: `<root-domain>` → `www.<root-domain>`
- API: `api.<root-domain>`
- 인증 이메일 발신: `auth@<root-domain>`

CORS는 production Web origin과 로컬 개발 origin만 허용한다. wildcard와
credentials 조합은 사용하지 않는다. 허용한 정확한 origin에는
`Access-Control-Allow-Credentials`를 활성화해 refresh cookie를 보낼 수
있게 한다.

## 8. 프론트엔드 배포

### 8.1 Web S3

- Vite 빌드 결과만 저장한다.
- Public Access Block을 활성화한다.
- ACL을 비활성화한다.
- S3 website endpoint를 공개하지 않는다.
- CloudFront Origin Access Control만 읽을 수 있다.

### 8.2 CloudFront

- 기본 origin은 Web S3다.
- HTTPS만 허용한다.
- CloudFront용 ACM 인증서를 연결한다.
- 해시가 붙은 JS·CSS·이미지는 장기 캐시한다.
- `index.html`은 짧게 캐시하고 배포 시 무효화한다.
- SPA 경로는 `index.html`로 안전하게 fallback한다.
- 초기에는 WAF를 추가하지 않고 API Gateway throttling과 인증을 사용한다.

### 8.3 배포

1. Web lint, typecheck, component test, build
2. S3에 해시 자산 업로드
3. `index.html` 업로드
4. CloudFront의 HTML 경로만 무효화
5. 배포 결과와 배포된 commit SHA 기록

## 9. 인증과 인가

### 9.1 역할 분리

- Cognito는 사용자 신원과 토큰을 관리한다.
- Aurora는 애플리케이션 `LEARNER`, `ADMIN` role을 관리한다.
- IAM은 AWS 리소스 접근을 관리한다.

관리자 여부를 이메일 문자열, `+admin` 별칭, Cognito email attribute에서
추론하지 않는다. Cognito의 변경 불가능한 `sub`를 Aurora 사용자 키로
사용한다.

### 9.2 학교 이메일 passwordless 인증

Cognito User Pool의 `CUSTOM_AUTH`와 다음 Lambda trigger를 사용한다.

- Define Auth Challenge
- Create Auth Challenge
- Verify Auth Challenge Response

인증 절차:

1. 사용자가 학교 이메일을 입력한다.
2. API는 이메일을 소문자화하고 허용 도메인을 검사한다.
   `+tag`는 관리자 판정에 사용하지 않으며 이메일 주소에서 임의로 제거하지
   않는다.
3. 존재 여부를 노출하지 않는 동일한 응답을 반환한다.
4. Cognito custom auth를 시작한다.
5. challenge에는 서로 다른 두 답을 만든다.
   - 6자리 숫자 코드
   - 충분히 긴 일회용 링크 token
6. SES가 링크와 코드를 같은 이메일에 보낸다.
7. 코드 입력 또는 링크 확인 POST가 성공하면 Cognito가 token을 발급한다.
8. 첫 인증 사용자는 Aurora 사용자 row를 생성한다.

challenge의 서버 상태는 challenge ID로 관리하고, 답의 원문은 저장하지
않는다. Aurora의 짧은 수명 challenge row에는 암호화한 Cognito session,
답의 HMAC, 만료, 시도 횟수, 상태만 둔다. 따라서 인증 요청을 시작한
브라우저와 이메일 링크를 여는 브라우저가 달라도 challenge ID로 Cognito
session을 이어 갈 수 있다. session 암호화 key와 HMAC pepper는 Secrets
Manager에서 분리해 관리한다. 짧은 숫자 코드는 무차별 대입에 취약하므로
무작위 salt와 pepper를 사용한 HMAC으로 저장한다.

### 9.3 이메일 스캐너 방어

- 이메일 링크의 GET 요청은 로그인 완료가 아니라 확인 화면만 보여 준다.
- 실제 교환은 사용자가 확인 버튼을 누른 POST 요청에서만 수행한다.
- token은 한 번만 사용할 수 있다.
- 사용·만료·취소된 token은 다시 세션을 만들 수 없다.
- 링크 token과 숫자 코드 중 하나가 성공하면 같은 challenge의 다른 답도
  즉시 무효화한다.

### 9.4 초기 보안 기본값

| 항목 | 값 |
| --- | --- |
| 이메일 challenge 만료 | 10분 |
| 코드 최대 실패 | 5회 |
| 재전송 최소 간격 | 60초 |
| 이메일별 재전송 제한 | 1시간에 5회 |
| Access token | 15분 |
| Refresh token | 30일 |
| Refresh token rotation grace | 10초 |

이 값은 Parameter Store에서 환경 설정으로 관리하되 보안 최댓값을
애플리케이션 검증으로 제한한다.

### 9.5 브라우저 token 저장

- Access token은 브라우저 메모리에만 둔다.
- `localStorage`, `sessionStorage`, IndexedDB에 token을 저장하지 않는다.
- Refresh token은 API host 전용 `Secure`, `HttpOnly`, `SameSite=Lax`
  cookie에만 두고 path를 인증 endpoint 범위로 제한한다.
- API 호출은 Cognito access token을 `Authorization: Bearer`로 보낸다.
- API Gateway JWT Authorizer는 issuer, audience, 서명, 만료를 확인한다.
- API 권한에는 ID token이 아니라 access token을 사용한다.
- NestJS auth guard도 `token_use=access`와 Cognito app client ID를 확인해
  ID token의 오용을 막는다.
- refresh와 logout은 POST만 허용하고 정확한 `Origin`과 필수 CSRF header를
  함께 검사한다. 임의 Web origin은 preflight를 통과할 수 없다.
- refresh endpoint는 refresh token rotation을 적용해 access token을
  갱신한다.
- 로그아웃은 Cognito refresh token을 revoke하고 cookie를 삭제한다.

### 9.6 애플리케이션 권한

JWT 검증 뒤 NestJS guard가 `sub`로 Aurora 사용자를 조회한다.

- 비활성 사용자면 거부한다.
- 관리자 API는 DB role이 `ADMIN`인지 확인한다.
- 관리자 role 변경은 즉시 반영해야 하므로 장기 캐시하지 않는다.
- 첫 관리자는 감사 기록을 남기는 1회성 bootstrap command로만 만든다.
- 초기에는 관리자 승격 UI를 제공하지 않는다.
- 관리자 휴대전화는 Cognito `phone_number`에 E.164 형식으로 보관하고,
  실제 OTP 성공 뒤에만 검증 완료로 표시한다.
- 관리자 role이 있어도 검증된 휴대전화가 없으면 민감 작업을 실행할 수
  없다.

### 9.7 관리자 휴대전화 step-up OTP

민감 작업:

- AI 대량 생성 시작
- 생성 결과 승인과 발행
- 게시 콘텐츠 숨김·복구
- 관리자 role 변경
- Provider·프롬프트 운영 설정 변경

절차:

1. access token과 DB `ADMIN` role을 먼저 확인한다.
2. 암호학적으로 안전한 6자리 OTP를 만든다.
3. OTP 원문 대신 salt와 pepper 기반 HMAC, 만료, 시도 횟수를 저장한다.
4. SNS SMS로 전송한다.
5. 성공하면 관리자와 작업 범주에 묶인 step-up grant를 발급한다.
6. 민감 API는 유효한 grant가 없으면 실행하지 않는다.

| 항목 | 값 |
| --- | --- |
| OTP 만료 | 5분 |
| 최대 실패 | 5회 |
| 재전송 최소 간격 | 60초 |
| 관리자별 요청 제한 | 1시간에 5회 |
| Step-up grant | 10분 |

OTP와 token 원문, 휴대전화 전체 번호는 로그에 남기지 않는다.
production SMS를 열기 전에 한국 수신 번호와 발신 방식에 필요한 SNS
등록·샌드박스 해제 절차를 확인한다.

## 10. API와 백엔드 실행

### 10.1 API Gateway

- HTTP API를 사용한다.
- Cognito access token용 JWT Authorizer를 사용한다.
- 공개 인증·health route와 인증 route를 분리한다.
- production과 localhost만 CORS allowlist에 둔다.
- route별 throttling을 적용한다.
- access log에는 request ID, route, status, latency만 남기고 token과 body는
  남기지 않는다.

### 10.2 NestJS Lambda

- NestJS는 하나의 모듈러 모놀리스 애플리케이션이다.
- Lambda entrypoint는 NestJS HTTP application을 재사용 가능한 실행
  환경에서 캐시한다.
- Lambda 어댑터는 구현 시점의 유지보수 상태를 확인해
  `@codegenie/serverless-express`를 기본으로 사용한다.
- 번들은 esbuild로 만든다.
- 요청 handler는 장시간 AI 작업을 직접 기다리지 않는다.
- API는 작업 row와 SQS message를 만든 뒤 `202 Accepted`를 반환한다.

### 10.3 초기 실행 제한

- API Lambda 예약 동시성: 5
- API timeout: API Gateway 제한 안에서 30초 이하
- 일반 API 목표: DB가 깨어 있을 때 p95 1초 이내
- Aurora가 일시 중지 상태면 첫 요청이 느리거나 한 번 재시도될 수 있음을
  허용한다.
- AI Provider 호출은 API Lambda에서 하지 않는다.

실측 후 예약 동시성을 조정한다. 높은 값을 먼저 열어 Provider·DB를
과부하시키지 않는다.

## 11. DB, ORM, 검색, 캐시

### 11.1 Aurora PostgreSQL Serverless v2

초기 구성:

| 항목 | 값 |
| --- | --- |
| 엔진 | Aurora PostgreSQL |
| 버전 | 서울 리전에서 Data API와 0 ACU를 함께 지원하는 최신 검증 버전 |
| Writer | 1개 |
| Reader | 없음 |
| 최소 ACU | 0 |
| 최대 ACU | 2 |
| 자동 일시 중지 | 유휴 15분 |
| 백업 보존 | 7일 |
| 삭제 보호 | production 활성화 |
| 공개 접근 | 비활성화 |

Reader를 두지 않는 이유:

- 초기 사용자는 한 명이다.
- Reader는 최소 용량과 운영 비용을 추가한다.
- Writer 장애 시 즉시 failover보다 비용 절감이 우선인 개인 초기 서비스다.

추가 조건:

- ACU가 자주 최대치에 닿으면 쿼리와 인덱스를 먼저 확인한다.
- 최적화 후에도 부족하면 최대 ACU를 4로 올린다.
- 가용성 요구가 높아지면 별도 Serverless Reader를 추가한다.

### 11.2 RDS Data API

- Lambda는 Aurora에 직접 TCP 연결하지 않는다.
- AWS SDK를 통해 HTTPS Data API를 호출한다.
- DB 자격 증명은 Secrets Manager에 저장한다.
- Lambda role은 특정 cluster와 secret에만 접근할 수 있다.
- API Lambda의 Data API 요청 timeout은 25초로 둔다.
- Aurora가 깊은 일시 중지 상태라 25초 안에 응답하지 않으면
  `503 DB_RESUMING`과 짧은 `Retry-After`를 반환하고, 프론트엔드는 제한된
  횟수만 재시도한다.
- 백그라운드 worker의 Data API timeout은 60초로 두고 재개를 기다린다.
- 영속 연결이 없어 Lambda 연결 폭증과 NAT Gateway를 피한다.

### 11.3 ORM과 migration

- ORM은 Drizzle ORM을 사용한다.
- 드라이버는 `drizzle-orm/aws-data-api/pg`를 사용한다.
- schema와 migration은 `backend/database`에서 관리한다.
- production migration은 GitHub Actions의 별도 수동 승인 step으로
  실행한다.
- 애플리케이션 시작 시 자동 migration하지 않는다.
- destructive migration은 expand → backfill → switch → contract 순서를
  사용한다.

Drizzle은 공식 문서에서 AWS Data API PostgreSQL 연결을 제공한다.

### 11.4 검색

초기에는 외부 검색 엔진을 사용하지 않는다.

- 표시용 태국어 원문과 검색용 정규화 값을 분리한다.
- 정규화 함수는 `backend/domain`의 순수 함수로 버전 관리한다.
- PostgreSQL에 `normalized_form`과 `normalization_version`을 저장한다.
- 공용 어휘는 정규화 표기에 고유 제약을 둔다.
- 정확 일치와 prefix 검색은 B-tree 기반으로 시작한다.
- 부분·오타 검색이 실제로 필요하면 `pg_trgm`을 별도 측정 후 추가한다.
- Aurora 조회가 감당하지 못할 때만 OpenSearch를 재검토한다.

구체적인 태국어 정규화 규칙은 백엔드 설계에서 예시 데이터와 단위
테스트로 확정한다. Unicode 정규화만으로 태국어 중복 판정을 끝내지 않는다.

### 11.5 캐시

- 서버 측 Redis·ElastiCache는 초기 도입하지 않는다.
- 정적 자산과 허가된 media 전달은 CloudFront가 캐시한다.
- 브라우저 서버 상태는 TanStack Query가 캐시한다.
- role, 게시 상태, 작업 상태처럼 즉시성이 중요한 값은 장기 캐시하지 않는다.
- DB 부하가 실측상 문제일 때만 구체적인 query 단위 캐시를 추가한다.

## 12. 파일과 음성 저장

### 12.1 버킷 분리

| 버킷 | 데이터 | 공개 여부 | 수명 |
| --- | --- | --- | --- |
| Web | Vite build | CloudFront만 읽기 | 배포 버전 |
| Input | PDF, IMAGE, TEXT 원본 | 비공개 | 업로드 후 30일 |
| Media | 검증된 단어·문장 음성 | 비공개 | 참조 중 보존 |

버킷을 분리해 원본 삭제 정책이 게시 음성을 지우지 못하게 한다.

공통 기본값:

- Public Access Block 활성화
- ACL 비활성화
- bucket policy와 IAM role만 사용
- S3 기본 서버 측 암호화
- HTTPS 요청만 허용
- production 삭제 방지 정책

초기에는 customer-managed KMS key를 만들지 않는다. AWS 관리 암호화로
시작하고 규제나 키 분리 요구가 생기면 전환한다.

### 12.2 업로드

1. 브라우저가 API에 파일 메타데이터를 보낸다.
2. API가 MIME, 확장자, 크기, 작업 권한을 검사한다.
3. API가 content-length 범위, object key, 허용 content type을 포함한 10분
   유효 사전 서명 POST 정책을 만든다.
4. 브라우저가 그 정책으로 Input S3에 직접 업로드한다.
5. 완료 요청에서 실제 S3 object metadata를 다시 확인한다.
6. 파일 signature와 실제 형식을 확인하고, PDF는 page 수와 암호화 여부를
   검사한다.
7. 검증 후에만 Job을 큐에 넣는다.

초기 기술 guardrail:

- 파일당 최대 25MB
- PDF 최대 30페이지
- 한 작업의 총 업로드 최대 250MB
- 파일 개수는 제품 사용량 전제로 고정하지 않는다.
- 허용 형식은 TEXT, PDF, IMAGE다.
- 실행 파일, 압축 파일, 암호화 PDF는 거부한다.

이 값은 사용자 수 예측이 아니라 메모리·비용·악성 입력을 막는 기술 한도다.
실제 자료로 측정해 Parameter Store 값과 서버 상한을 조정한다.
TEXT 입력은 API body 상한 안에서 받고, API가 UTF-8 객체로 Input S3에
저장해 PDF·IMAGE와 같은 수명 정책을 적용한다.

### 12.3 원본 보존

- Input 객체는 업로드 30일 후 S3 Lifecycle로 삭제한다.
- 입력 자료를 독립 자료 도메인으로 만들지 않는다.
- 파일·페이지별 사용자 UI와 장기 출처 추적을 만들지 않는다.
- Job에는 원본 S3 key와 기본 metadata만 보존한다.
- 보안 사고·오류 조사 전에 삭제된 원본을 복원할 수 있다고 약속하지 않는다.

### 12.4 음성

- TTS 결과는 content-addressed key를 사용한다.
- key에는 정규화 텍스트, 언어, Provider, voice, 설정 버전 hash를 반영한다.
- 같은 입력과 설정이면 기존 음성을 재사용한다.
- DB에는 S3 key, duration, format, checksum, Provider metadata를 저장한다.
- 필수 음성이 없는 콘텐츠는 게시하지 않는다.
- CloudFront의 `/media/*` behavior가 Media S3를 OAC로 읽는다.
- 비공개 media는 CloudFront key group으로 검증하는 짧은 수명의 서명 URL로
  제공한다.
- 서명용 private key는 Secrets Manager에 저장하고 API Lambda만 읽는다.
- 초기 서명 URL 유효 시간은 5분이다.
- DB 참조가 사라진 media는 즉시 지우지 않고 30일 유예 후 정리한다.

## 13. AI·OCR·검증·TTS Provider

### 13.1 Adapter

다음 port를 `backend/providers`에 정의한다.

```text
OcrProvider
GenerationProvider
VerificationProvider
TtsProvider
```

애플리케이션은 공급자 SDK를 직접 import하지 않고 port를 통해 호출한다.

모든 실행은 다음을 기록한다.

- provider
- model
- operation
- prompt version
- schema version
- input/output token 또는 과금 단위
- 시작·종료 시각과 latency
- 시도 횟수
- success/failure
- provider request ID
- 추정 비용
- 오류 분류

API key와 전체 민감 payload는 기록하지 않는다.

### 13.2 Provider 선택 방식

초기 설계에서 특정 공급자를 영구 고정하지 않는다.

1. Provider별 최소 adapter를 만든다.
2. 작은 golden corpus로 정확도, 구조 준수, 태국어 품질, latency, 비용을
   측정한다.
3. 작업별 기본 Provider를 설정으로 선택한다.
4. 생성과 독립 검증은 가능하면 다른 모델 계열을 사용한다.
5. 결과 기록을 유지해 Provider 변경 전후를 비교한다.

이는 미결정이 아니라 **벤치마크 결과로 운영 설정을 정한다는 결정**이다.

### 13.3 책임

- Provider는 외부 API 변환과 응답 mapping을 담당한다.
- JSON Schema 검사는 Provider 밖의 공통 계층이 담당한다.
- 중복, 필수 어휘, 정답 일치 같은 결정 규칙은 domain이 담당한다.
- Verification Provider는 생성 결과를 독립적으로 검토한다.
- 게시 가능 여부는 domain 상태 전이가 결정한다.
- Provider 성공 응답만으로 콘텐츠를 게시하지 않는다.

## 14. 큐와 워크플로

### 14.1 SQS

- Standard Queue를 사용한다.
- Job message에는 큰 본문 대신 `jobId`만 넣는다.
- message retention은 4일이다.
- long polling을 사용한다.
- Job Starter Lambda batch size는 1로 시작한다.
- visibility timeout은 starter timeout보다 충분히 길게 둔다.
- 최대 5회 수신 실패 후 DLQ로 이동한다.
- DLQ retention은 14일이다.

### 14.2 Step Functions

Standard Workflow를 사용한다.

```text
VALIDATE_INPUT
→ OCR_IF_REQUIRED
→ EXTRACT_OR_GENERATE
→ NORMALIZE_AND_DEDUPLICATE
→ DETERMINISTIC_VALIDATE
→ INDEPENDENT_AI_VERIFY
→ TTS
→ PERSIST_RESULT
→ WAITING_FOR_ADMIN_REVIEW
```

- 실행 이름은 Job ID를 포함해 중복 시작을 막는다.
- 각 단계는 timeout을 명시한다.
- 일시 오류만 지수 backoff와 jitter로 재시도한다.
- schema·규칙 실패는 같은 입력으로 무한 재시도하지 않는다.
- 항목 실패가 전체 정상 항목을 취소하지 않게 Map 단위로 격리한다.
- 초기 Map 최대 동시성은 2다.
- Provider별 최대 동시성은 Parameter Store에서 1~2로 시작한다.

### 14.3 상태 분리

Job 전체 상태와 항목 상태를 분리한다.

Job:

- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `COMPLETED_WITH_FAILURES`
- `FAILED`
- `CANCELLED`

Item:

- `PENDING`
- `PROCESSING`
- `SUCCEEDED`
- `NEEDS_ATTENTION`
- `FAILED`

콘텐츠 검증, TTS, 관리자 승인, 게시 상태는 Job 상태와 별도 축으로 둔다.

### 14.4 재시도 분류

재시도 가능:

- provider rate limit
- 일시 네트워크 오류
- provider 5xx
- Lambda 일시 장애

즉시 주의·실패:

- 지원하지 않는 파일
- 암호화·손상 PDF
- JSON Schema 반복 실패
- 결정 규칙 위반
- 입력 자체의 태국어 내용 부족

각 Provider 호출은 최대 3회까지 지수 backoff로 재시도한다. 그 뒤에는
항목을 실패 또는 주의 상태로 남기고 다른 항목을 계속 처리한다.

### 14.5 중복 실행 방지

SQS Standard Queue와 Lambda는 중복 전달될 수 있다고 가정한다.

- 모든 변경 명령에 idempotency key를 둔다.
- Job 생성 요청은 관리자와 client request ID에 고유 제약을 둔다.
- Step Functions 실행 이름은 `Job ID + 실행 attempt`에서 결정한다.
- 중복 SQS message는 같은 attempt를 사용하고, 관리자의 명시적 재실행만
  transaction 안에서 attempt를 증가시킨다.
- Provider 실행은 job item, operation, attempt 기준으로 기록한다.
- 결과 저장은 DB transaction과 고유 제약을 사용한다.
- 동일한 Provider 결과를 중복 수신해도 콘텐츠와 과금 기록을 두 번 확정하지
  않는다.
- 같은 정규화 어휘의 동시 생성은 DB unique constraint로 최종 차단한다.

## 15. Fargate 전환 기준

초기 작업은 Lambda로 구현한다. 다음 중 하나가 실측되면 해당 작업만
ECS/Fargate Task로 옮긴다.

- 단일 작업을 안전하게 분할해도 12분 이상 걸린다.
- Lambda package·layer 한계에 가까운 native binary가 필요하다.
- Lambda 메모리·임시 디스크 범위에서 안정적으로 처리할 수 없다.
- 컨테이너 프로세스가 긴 시간 상태를 유지해야 한다.

Fargate 사용 시:

- 상시 ECS Service가 아니라 실행 후 종료하는 Task를 사용한다.
- Step Functions가 Task를 시작하고 완료를 기다린다.
- 컨테이너 이미지는 Fargate가 실제로 필요해질 때 생성하는 ECR repository에
  저장한다.
- CPU와 메모리는 측정값으로 설정한다.
- 외부 AI API 접근 때문에 NAT Gateway가 필요해지면 도입 전 월 고정비를
  다시 계산한다.
- NAT가 필요한 Fargate를 도입해도 API Lambda까지 VPC로 옮기지 않는다.

## 16. 보안 기본값

### 16.1 공개 표면

공개 endpoint:

- CloudFront Web
- API Gateway
- Cognito와 SES/SNS의 AWS 관리 endpoint

비공개:

- 모든 S3 bucket
- Aurora
- Secrets Manager secret
- Parameter Store의 민감 설정

### 16.2 IAM

- Lambda마다 별도 execution role을 둔다.
- resource와 action을 구체적으로 제한한다.
- Provider worker는 자기 secret만 읽는다.
- TTS worker는 필요한 Input read와 Media write만 허용한다.
- Job Starter는 특정 state machine 실행만 허용한다.
- API는 필요한 S3 prefix, Data API, queue 작업만 허용한다.
- wildcard resource는 CDK bootstrap 등 불가피한 관리 경계로 제한한다.

### 16.3 비밀과 설정

Secrets Manager:

- DB secret
- Provider API key
- OTP HMAC pepper
- Cognito challenge session 암호화 key
- CloudFront media URL 서명 private key
- 외부 서비스 credential

Parameter Store:

- allowed email domains
- concurrency
- timeout
- prompt default version
- bucket·state machine 식별자
- 공개 base URL

비밀은 프론트엔드 build variable에 넣지 않는다.

### 16.4 데이터 보호

- 전송은 HTTPS/TLS만 사용한다.
- S3와 Aurora의 저장 암호화를 사용한다.
- OTP, token, API key, 전체 이메일, 휴대전화 전체 번호를 로그에서
  마스킹한다.
- 관리자 변경은 append-only audit row로 기록한다.
- audit row에는 actor `sub`, action, target, before/after summary,
  request ID, 시각을 저장한다.
- 학습 원시 기록과 게시 콘텐츠 버전을 물리 삭제로 덮어쓰지 않는다.

### 16.5 초기 제외 보안 서비스

- WAF: 공개 트래픽과 공격 패턴이 확인될 때 추가
- customer-managed KMS key: 키 분리·규제 요구가 생길 때 추가
- NAT Gateway: 사설 workload의 외부 통신이 생길 때 추가
- 별도 SIEM: CloudWatch와 애플리케이션 audit로 부족할 때 추가

## 17. 관측과 비용

### 17.1 구조화 로그

공통 필드:

- timestamp
- level
- service
- requestId
- userSub 또는 actor hash
- jobId
- itemId
- provider
- operation
- attempt
- errorCode

로그 본문에 입력 PDF, 전체 prompt, 전체 AI 응답을 기본으로 남기지 않는다.
필요한 감사 정보는 접근이 제한된 DB record와 S3 artifact로 관리한다.

### 17.2 로그 보존

| 로그 | 보존 |
| --- | --- |
| API·일반 Lambda | 14일 |
| AI worker | 30일 |
| Step Functions 실행 로그 | 30일 |
| 애플리케이션 관리자 audit | DB 정책에 따라 장기 보존 |

### 17.3 초기 알람

- API Gateway 5xx
- API Lambda error, timeout, throttle
- Job Starter error
- SQS oldest message age
- DLQ message count `> 0`
- Step Functions failed execution
- Worker Lambda error, timeout, throttle
- Aurora ACU가 최대치에 지속 도달
- Aurora storage·connection 이상
- SES bounce·complaint
- SNS SMS delivery failure

알람은 운영자 이메일용 SNS topic으로 전달한다.

### 17.4 비용 방어선

- 모든 CDK resource에 `Project=flex-thia`, `Environment=prod`,
  `ManagedBy=cdk` tag를 단다.
- AWS Budgets 월 예산은 초기 30 USD로 둔다.
- 실제 사용액 50%, 80%, 100%와 예상 사용액 100%에서 이메일 알림을
  보낸다.
- 예산은 장애를 일으키는 자동 종료 장치로 사용하지 않는다.
- 외부 AI Provider 비용은 AWS Budgets에 포함되지 않으므로 DB 실행 기록으로
  별도 집계한다.
- Provider별 일일 예상 비용과 token을 관리자 화면에 표시할 수 있게
  기록한다.
- 예상치 못한 고정비를 막기 위해 NAT Gateway, 상시 Fargate Service,
  provisioned DB를 초기 생성하지 않는다.

## 18. 인프라 코드와 Stack

### 18.1 CDK

- AWS CDK v2와 TypeScript를 사용한다.
- `infra/`는 application source와 같은 repository에서 관리한다.
- secure default를 construct 단계에서 강제한다.
- 콘솔 수동 변경은 긴급 상황을 제외하고 하지 않는다.
- 긴급 변경은 즉시 CDK 코드에 반영해 drift를 없앤다.

### 18.2 Stack 경계

```text
DataStack (ap-northeast-2)
├─ Aurora
├─ Input S3
├─ Media S3
└─ Secrets

ApplicationStack (ap-northeast-2)
├─ Cognito
├─ SES/SNS integration
├─ API Gateway
├─ Lambda
├─ SQS/DLQ
├─ Step Functions
└─ CloudWatch alarms

EdgeStack (us-east-1 + global)
├─ ACM
├─ Web S3
├─ CloudFront
└─ Route 53 records
```

DataStack은 deletion protection과 retain 정책을 강하게 적용한다.
ApplicationStack은 빈번한 코드 배포를 허용한다. EdgeStack은 리전 예외와
정적 배포를 분리한다.

### 18.3 삭제 정책

- Aurora: 삭제 보호, stack 삭제 시 snapshot
- Input S3: stack 삭제 시 retain
- Media S3: stack 삭제 시 retain
- Web S3: production에서는 retain
- Log Group: 명시한 보존 기간 적용
- Queue와 DLQ: production stack 삭제 전 수동 확인

## 19. CI/CD

### 19.1 Pull request 검증

- format
- lint
- typecheck
- unit test
- frontend component test
- Provider contract test
- build
- CDK assertion test
- `cdk synth`

프로젝트 지침에 따라 브라우저·API 통합 E2E는 추가하지 않는다.

### 19.2 Production 배포

초기에는 `workflow_dispatch` 수동 실행만 허용한다.

1. GitHub Actions OIDC로 deploy role assume
2. 전체 검증 실행
3. `cdk diff` 결과 확인
4. Data migration 수동 승인
5. DataStack 변경 적용
6. ApplicationStack 변경 적용
7. EdgeStack 변경 적용
8. Web build 업로드와 CloudFront HTML 무효화
9. CloudWatch 오류와 stack 상태 확인

자동 production 배포는 배포 흐름이 안정된 뒤 별도 결정한다.

### 19.3 로컬 개발

- PostgreSQL은 Docker로 실행한다.
- AWS SDK 경계는 fake adapter로 대체한다.
- AI Provider는 fixture 기반 fake를 기본으로 사용한다.
- LocalStack은 초기 필수 도구로 두지 않는다.
- 실제 AWS 연동은 adapter contract와 필요할 때의 임시 stack으로 확인한다.

## 20. 백업과 장애 복구

### 20.1 DB

- Aurora 자동 백업과 7일 point-in-time restore를 사용한다.
- schema migration 전 수동 snapshot을 만든다.
- production 삭제 보호를 활성화한다.
- 복원 절차는 구현 후 한 번 실제로 연습한다.

### 20.2 파일

- Input은 임시 원본이므로 30일 뒤 삭제를 의도한다.
- 게시 Media는 immutable key를 사용해 덮어쓰기 손상을 막는다.
- 콘텐츠가 새 음성을 사용하면 새 key를 만들고 DB 참조를 교체한다.
- 참조가 없는 media는 30일 유예 뒤 정리한다.

### 20.3 초기 가용성 목표

- 다중 리전 복구를 제공하지 않는다.
- Aurora Reader가 없으므로 Writer 장애 시 재개 시간이 발생할 수 있다.
- 개인 초기 서비스에서 짧은 중단보다 고정비 절감을 우선한다.
- 데이터 손실 허용은 Aurora 백업 범위 안으로 제한한다.

가용성 요구가 높아지면 Reader, 별도 staging, 다중 계정, 더 긴 백업 보존을
순서대로 검토한다.

## 21. 실패 시나리오

### 21.1 Aurora가 일시 중지된 첫 요청

- Data API 호출이 Aurora를 깨운다.
- 첫 요청은 약 15초 이상 느릴 수 있다.
- 클라이언트는 일반 loading 상태를 유지한다.
- 25초 안에 응답하지 않으면 API는 `503 DB_RESUMING`을 반환한다.
- 클라이언트는 `Retry-After`에 따라 제한된 횟수만 다시 요청한다.
- 반복적으로 UX를 해치면 최소 ACU를 0.5로 올린다.

### 21.2 동일 Job message 중복 수신

- Job 상태와 deterministic execution name을 확인한다.
- 이미 시작된 Job이면 새 Step Functions 실행을 만들지 않는다.
- 성공으로 처리해 SQS message를 제거한다.

### 21.3 일부 AI 항목 실패

- 정상 항목은 계속 처리한다.
- 실패 항목만 재시도한다.
- Job은 `COMPLETED_WITH_FAILURES`가 될 수 있다.
- 실패 항목은 관리자 화면에서 원인과 다음 행동을 제공한다.

### 21.4 Provider 장애

- 일시 오류는 최대 3회 backoff 재시도한다.
- rate limit은 큐 소비 속도를 낮춘다.
- 장기 장애면 Job을 보존하고 Provider 설정 변경 뒤 재실행한다.
- fallback Provider를 자동 사용해 품질이 바뀌는 동작은 초기에는 하지 않는다.

### 21.5 TTS 실패

- 콘텐츠 검증 성공과 TTS 성공을 분리한다.
- 해당 콘텐츠만 게시를 차단한다.
- 이미 성공한 다른 콘텐츠는 영향을 받지 않는다.

### 21.6 이메일 링크 스캐너

- GET은 확인 화면만 반환한다.
- POST와 유효한 일회용 token이 함께 있어야 인증을 완료한다.
- 스캐너 방문 로그는 challenge 실패 횟수에 포함하지 않는다.

### 21.7 관리자 OTP 공격

- role 확인 전 OTP를 보내지 않는다.
- 횟수, 재전송, 만료 제한을 적용한다.
- OTP 원문은 저장·로그하지 않는다.
- 실패가 누적되면 challenge를 폐기하고 새 인증을 요구한다.

### 21.8 잘못된 배포

- CDK diff에서 replacement와 deletion을 확인한다.
- DataStack은 retain과 deletion protection을 사용한다.
- 애플리케이션 실패는 이전 Lambda artifact로 재배포한다.
- DB destructive migration은 같은 배포에서 즉시 실행하지 않는다.

## 22. 검증 전략

### 22.1 단위 테스트

- 태국어 정규화
- 어휘 중복 판정
- 상태 전이
- 게시 조건
- OTP 만료·횟수·재사용 방지
- idempotency
- Provider 오류 분류
- 비용 계산

테스트 설명은 한국어로 작성한다.

### 22.2 컴포넌트 테스트

- 이메일 코드 입력
- 이메일 링크 확인
- 관리자 OTP
- Job polling과 부분 실패 표시
- 파일 업로드 오류

### 22.3 Provider contract test

모든 Provider adapter에 같은 계약을 적용한다.

- timeout
- 취소
- schema mapping
- usage metadata
- provider request ID
- retryable/non-retryable error
- 민감 정보 로그 제외

실제 유료 API는 기본 CI에서 호출하지 않는다.

### 22.4 인프라 테스트

CDK assertion으로 다음을 확인한다.

- S3 public 차단
- CloudFront OAC
- HTTPS 강제
- Aurora 공개 접근 차단
- DataStack retain·삭제 보호
- SQS DLQ 연결
- Lambda timeout·동시성
- IAM wildcard 최소화
- Log Group 보존 기간
- Budget과 핵심 알람

### 22.5 기본 게이트

- format
- lint
- typecheck
- unit test
- component test
- provider contract test
- build
- CDK test
- `cdk synth`

E2E 테스트와 E2E 스캐폴딩은 두지 않는다.

## 23. 수용 기준

다음이 모두 충족되면 인프라·프로젝트 아키텍처 설계가 구현 계획의
입력으로 사용할 수 있다.

1. 프론트엔드는 비공개 S3와 CloudFront로 배포된다.
2. S3는 직접 공개되지 않고 HTTPS로만 전달된다.
3. 학교 이메일 링크와 6자리 코드가 같은 Cognito custom auth 흐름에서
   동작한다.
4. 링크 GET만으로 세션이 만들어지지 않는다.
5. API Gateway는 Cognito access token을 검증한다.
6. 관리자 권한은 Cognito `sub`와 Aurora role로 판정한다.
7. 민감 관리자 작업은 최근 휴대전화 step-up OTP를 요구한다.
8. NestJS API는 장시간 AI 호출을 기다리지 않고 Job을 큐에 넣는다.
9. Aurora는 Data API로 접근하며 초기 NAT Gateway가 없다.
10. 원본 파일, media, Web 자산의 버킷과 수명 정책이 분리된다.
11. SQS 중복 전달이 콘텐츠와 비용 기록을 중복 확정하지 않는다.
12. Step Functions가 AI 생성·검증·TTS 단계를 추적한다.
13. 항목 하나의 실패가 같은 Job의 정상 항목을 막지 않는다.
14. Provider 실행의 모델·버전·사용량·비용·오류가 기록된다.
15. 필수 TTS가 없으면 게시할 수 없다.
16. DataStack 삭제와 destructive migration이 보호된다.
17. 핵심 오류와 비용에 알람이 있다.
18. 인프라는 CDK 코드로 재현할 수 있다.
19. 검증은 단위·컴포넌트·Provider contract·CDK assertion으로 구성된다.
20. E2E 스캐폴딩이 추가되지 않는다.
21. refresh와 logout은 허용 origin과 CSRF header 없이는 cookie를 사용하지
    않는다.
22. Input S3 업로드 크기 제한은 사전 서명 정책과 완료 검증 양쪽에서
    적용된다.

## 24. 후속 단계

이 문서가 승인되면 다음 순서로 진행한다.

1. 백엔드 구현 계획
   - ERD
   - NestJS 모듈
   - API 계약
   - 인증·상태 전이
   - 큐와 workflow 상세
   - DB migration과 테스트 순서
2. 프론트엔드 구현 계획
   - 페이지와 라우팅
   - 인증 상태
   - TanStack Query 경계
   - 관리자 Job UX
   - 공통 태국어 상호작용
   - 컴포넌트 테스트 순서
3. 승인된 계획을 작은 구현 단계로 실행

Provider 제품과 모델의 기본값은 Provider benchmark 작업에서 실측해 운영
설정으로 확정하며, 그 결과를 이 문서의 아키텍처 변경으로 취급하지 않는다.

## 25. 참고한 공식 문서

- [What is Amazon S3?](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [Amazon S3 POST policy](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-HTTPPOSTConstructPolicy.html)
- [What is Amazon CloudFront?](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html)
- [What is Amazon Cognito?](https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html)
- [Custom authentication challenge Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html)
- [Cognito refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)
- [API Gateway HTTP API JWT authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [What is AWS Lambda?](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)
- [Using Aurora Serverless](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [Aurora Serverless automatic pause and resume](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)
- [Using the RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html)
- [Drizzle ORM AWS Data API PostgreSQL](https://orm.drizzle.team/docs/connect-aws-data-api-pg)
- [What is Amazon SQS?](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
- [What is AWS Step Functions?](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html)
- [AWS Fargate for Amazon ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [What is IAM?](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html)
- [What is AWS Secrets Manager?](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [What is Amazon CloudWatch?](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html)
- [What is the AWS CDK?](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [What is AWS CloudFormation?](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html)
- [Managing costs with AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)

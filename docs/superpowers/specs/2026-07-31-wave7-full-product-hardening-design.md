# Wave 7 전체 제품 완성·실행 안정화 설계

- 작성일: 2026-07-31
- 상태: 사용자 승인
- 감사 기준: local `main` (`c478945`)
- 구현 기준: 설계 커밋을 포함한 local `main`
- 동시 작업 수: 3개

## 1. 목적

Wave 1~6에서 구현한 기능을 실제 사용자가 로컬에서 관리자와 학습자로
검증할 수 있게 연결하고, 감사에서 확인된 제품 기능과 production 전달
공백을 닫는다. 세 작업은 서로 다른 파일 경계를 소유하며 최신 local
`main`에서 각각 시작한다.

이번 Wave가 끝나면 다음 상태를 만족해야 한다.

- 다른 프로젝트가 host 3000·5432를 사용해도 FLEX THIA 전체 stack이
  동시에 실행된다.
- 학습자 seed 콘텐츠의 음성과 관리자 업로드가 실제 브라우저에서
  동작한다.
- 로컬 deterministic 콘텐츠 작업이 문제·어휘 후보를 만들고 관리자
  검수·승인 흐름으로 이어진다.
- 기획에 명시됐지만 노출되지 않은 핵심 관리자·학습자 기능을 화면에서
  사용할 수 있다.
- production 배포가 probe HTML이 아니라 정확한 Vite build를 전달하고
  API subdomain을 호출한다.
- 사용자는 root 실행 문서만 보고 관리자·학습자 주요 흐름을 재현할 수
  있다.

## 2. 감사 결과와 범위 결정

### 2.1 확인된 차단

현재 `main`의 단위 테스트와 build는 통과하지만 다음 동작은 실패하거나
노출되지 않는다.

- `compose.yaml`이 host 3000·5432를 고정 점유한다.
- 콘텐츠와 음성 upload policy가 브라우저에서 도달할 수 없는 fake URL을
  반환한다.
- seed media storage key와 local reader의 허용 규칙이 다르고 volume에
  실제 음성 container가 없다.
- local content processor가 상태만 성공시키고 문제·어휘 후보를 저장하지
  않는다.
- AI 어휘 후보의 조회·검수·승인·폐기 API와 화면이 없다.
- 관리자 계정은 학습자 화면으로 전환할 수 없고 `/`는 빈 화면이다.
- 어휘 필터·상세 정보와 관리자 문제 검수 화면의 핵심 동작이 일부
  누락됐다.
- EdgeStack은 `frontend/web/dist` 대신 infrastructure probe를 배포한다.
- production bundle에 `api.<domain>` 주소가 주입되지 않는다.
- production web bundle이 하나의 917KB application chunk로 생성된다.
- Docker build context가 gitignored PEM private key를 포함할 수 있다.
- 구조화 logger가 Nest의 문자열 context와 Error를 metadata처럼 펼친다.
- 로컬 실행 문서가 삭제된 password login API를 안내한다.

OpenAPI 129개 path와 API Gateway 129개 route는 일치했다. 전역 접근성,
모바일 table overflow, route error recovery에서도 별도의 차단은 확인되지
않았으므로 추측성 재작성은 하지 않는다.

### 2.2 검토한 접근

#### 접근 A: 실행 차단만 수정

포트, upload, media, production artifact만 고친다. 가장 작지만 AI 어휘
후보와 역할 전환 같은 제품 기획 공백이 남아 전체 제품 완료라고 할 수
없어 채택하지 않는다.

#### 접근 B: 세 개의 세로 완성 단위

로컬 runtime, 제품 기능, delivery hardening으로 파일 소유권을 나누고
각 단위가 독립 테스트를 가진다. 통합 후 한 번만 생성 파일과 전체
문서를 조정할 수 있어 충돌이 가장 적다. 이 접근을 채택한다.

#### 접근 C: 계층별 분리

백엔드, 프론트엔드, 인프라로 나눈다. 계약과 사용자 행동이 여러
브랜치에 걸쳐 부분 완료 상태가 되고 `shared/contracts`와 조립 파일에서
충돌이 커지므로 채택하지 않는다.

## 3. 공통 제약

- 외부 유료 AI·OCR·TTS provider, SDK, API 호출을 추가하지 않는다.
- production AI·TTS가 설정되지 않은 경우 기존처럼 fail-closed한다.
- local fake는 결정론적이며 외부 네트워크와 비용 없이 동작한다.
- E2E runner나 browser spec을 추가하지 않는다.
- 새 package를 추가하지 않고 현재 workspace dependency로 구현한다.
- 테스트의 `describe`, `it`, `test` 설명은 한국어로 작성한다.
- 변경되는 코드는 주석·구조·frontend component convention을 따른다.
- migration과 `routeTree.gen.ts` 같은 생성 파일은 통합 브랜치에서만
  갱신한다.
- Docker volume은 보존하며 종료할 때 `down -v`를 사용하지 않는다.
- 다른 프로젝트의 container와 host port를 중지하거나 변경하지 않는다.
- 검증이 끝난 `dist`, `coverage`, `.vite`, `cdk.out`만 정확한 경로로
  제거한다.

## 4. 작업 단위 1: local runtime

논리 브랜치 이름은 `codex/wave7-local-runtime`이다.

### 4.1 소유 경계

- `compose.yaml`
- root local 실행 script와 `README.md`
- `backend/config/src/local-compose.spec.ts`
- `backend/providers/src/storage`의 local upload·media adapter
- `backend/providers/src/fakes`의 deterministic production adapter
- `backend/api/src/media`의 local-only upload·read controller
- local runtime 조립에 필요한 `backend/api/src/app.module.ts`의 제한된
  변경
- `backend/database/seed/local.sql`과 local media fixture command
- `backend/worker/src/local-worker.ts`의 local content dispatch 연결

다른 작업 단위는 위 파일을 수정하지 않는다.

### 4.2 충돌 없는 실행 환경

Compose 내부 port는 PostgreSQL 5432와 API 3000을 유지한다. host publish
port만 다음 변수로 바꾼다.

- `FLEX_THIA_POSTGRES_HOST_PORT`, 기본값 `55432`
- `FLEX_THIA_API_HOST_PORT`, 기본값 `53000`
- `FLEX_THIA_WEB_HOST_PORT`, 기본값 `5173`
- `FLEX_THIA_LOCAL_PUBLIC_ORIGIN`, 기본값
  `http://localhost:5173`

브라우저에 반환하는 media·upload URL은 public origin을 사용한다. web
Nginx의 `/api/` proxy를 통하므로 브라우저 주요 흐름은 API host port에
의존하지 않는다. API direct health와 Swagger 확인용으로만 53000을
publish한다.

root script는 project name을 `flex-thia-local`로 고정하고 fresh start와
preserve start를 구분한다.

- fresh start: schema reset, seed, media fixture 생성 후 전체 profile 실행
- preserve start: 기존 DB를 reset하지 않고 API·worker·web 실행
- stop: 같은 project만 `docker compose down`하며 volume은 지우지 않음

### 4.3 실제 local upload

두 fake provider가 `.invalid` 또는 root localhost URL을 반환하지 않게
local filesystem upload adapter를 둔다. adapter는 기존 public policy
계약을 유지하고 local-only HMAC token이 포함된 same-origin URL을
반환한다.

local upload controller는 production에서 등록되지 않으며 다음만
허용한다.

- policy에 고정된 object key와 content type
- 선언한 최대 byte size 이하의 단일 파일
- 유효 기간 안의 HMAC token
- content-production input과 audio asset이 사용하는 허용 prefix

성공한 파일은 local upload directory에 저장하고 inspection은 실제
저장된 byte size, MIME, SHA-256을 읽는다. 오류 응답에는 filesystem
경로나 secret을 포함하지 않는다.

### 4.4 seed media와 signed read

seed SQL의 모든 READY media key는 local reader가 허용하는 canonical
storage key로 통일한다. fresh seed command는 같은 key의 작은 deterministic
WAV container를 TTS volume에 함께 기록한다.

local media reader는 허용된 canonical prefix만 hash하고, URL에는 원래
storage key를 노출하지 않는다. HMAC 만료·서명·hash 검증과 directory
escape 차단은 유지한다. DB row가 READY면 fixture가 반드시 존재하고,
fixture가 없는 row는 READY로 seed하지 않는다.

### 4.5 deterministic content pipeline

local job은 status-only 결과로 끝나지 않는다.

- preset snapshot의 vocabulary 목적과 question plan을 그대로 item seed로
  펼친다.
- local vocabulary item은 기존 AI vocabulary candidate repository에
  결정론적 후보를 저장한다.
- local question item은 기존 AI question candidate repository에
  검증 가능한 draft 후보를 저장한다.
- 같은 job·item을 다시 처리해도 후보가 중복되지 않는다.
- 입력 ordinal에 따라 성공·검토 필요·재시도 실패 fixture를 재현한다.
- 승인된 question draft가 만드는 TTS outbox는 기존 local worker가
  처리하고 실제 local audio container를 기록한다.

production worker processor의 코드를 API에 import하지 않는다. local
adapter는 domain port와 repository interface만 소비하며 production
provider 선택에는 영향을 주지 않는다.

### 4.6 로컬 수동 테스트 문서

root `README.md`는 다음을 단일 진입점으로 제공한다.

- fresh/preserve start와 stop 명령
- web, API health, Swagger URL
- 학습자 `learner@hufs.ac.kr` / 이메일 코드 `123456`
- 관리자 `admin@hufs.ac.kr` / 이메일 코드 `123456` / TOTP `123456`
- fresh start가 로컬 데이터를 초기화한다는 경고
- 학습·업로드·후보 검수·TTS·게시 수동 확인 순서
- 외부 유료 provider가 없고 production provider는 fail-closed라는 범위
- volume을 보존하는 종료와 선택적 캐시 정리 방법

## 5. 작업 단위 2: product completion

논리 브랜치 이름은 `codex/wave7-product-completion`이다.

### 5.1 소유 경계

- AI vocabulary candidate의 `shared/contracts`
- `backend/api/src/content-production`의 vocabulary candidate
  controller·service·Swagger
- 필요한 `backend/domain/src/content-production` 공개 use case
- `frontend/web/src/pages`와 `features`의 후보 검수 화면
- 역할 전환과 root route
- 학습자 어휘 목록·상세 화면
- 관리자·학습자 home과 관리자 question detail 화면
- 위 기능의 단위·component 테스트

작업 단위 1의 local adapter·seed·compose와 작업 단위 3의 infra·workflow·
Vite config는 수정하지 않는다.

### 5.2 AI 어휘 후보 검수

기존 `VocabularyProductionCandidateRecord`와 repository를 단일 원본으로
사용해 다음 관리자 동작을 공개한다.

- job별 또는 상태별 후보 목록
- 후보 상세와 validation 결과 확인
- 후보 폐기
- 승인 시 기존 공용 어휘 생성·갱신 흐름으로 전달
- revision 또는 현재 상태가 바뀐 stale mutation 거절
- 승인·폐기의 actor와 결과를 audit log에 기록

화면은 pending, validation failure, approved, rejected 상태를 구분하고
mutation 진행 중 중복 요청을 막는다. API problem은 사용자가 재시도할
수 있는 메시지로 표시한다.

### 5.3 관리자와 학습자 역할 전환

ADMIN은 관리 기능을 잃지 않은 채 learner portal을 사용할 수 있다.
frontend guard와 backend learner authorization 모두 ADMIN을 learner
capability의 상위 역할로 취급한다. 두 shell은 현재 이메일·역할과
`학습 화면` 또는 `관리 화면` 링크를 표시한다. LEARNER에게 관리자 링크나
관리 API 권한을 주지 않는다.

root `/`는 빈 화면을 반환하지 않는다. 세션이 없으면 `/login`, learner면
`/learn`, admin이면 마지막 선택 portal 또는 `/admin`으로 이동한다.

### 5.4 어휘 학습 정보

어휘 목록은 이미 공개된 query contract의 검색어, kind, 품사, 난이도,
page를 실제 control과 pagination에 연결한다. 정렬·주제처럼 공개
계약에 없는 추측 기능은 추가하지 않는다.

어휘 상세는 응답에 이미 있는 품사, 난이도, 성조 표시, 뜻과 발음의 연결,
audio 상태를 화면에 보존한다. 모바일과 keyboard 동작은 기존 shared UI
primitive를 사용한다.

### 5.5 home과 관리자 검수

학습자 home에는 기존 API로 증명 가능한 최근·추천 콘텐츠와 문제·어휘·
단어장·연습 빠른 링크를 둔다. 별도 “오늘 게시” API가 없으면 숫자를
추측하지 않는다.

관리자 home에는 기존 query가 제공하는 오류 신고, 후보, TTS, 사용량과
재인증 상태를 빠짐없이 표시한다. 관리자 question detail은 기존 question
version response로 실제 문제 preview와 두 버전 비교를 제공하고, 기존
TTS 재생성 operation이 있을 때만 action을 노출한다.

## 6. 작업 단위 3: delivery hardening

논리 브랜치 이름은 `codex/wave7-delivery-hardening`이다.

### 6.1 소유 경계

- `infra/src/edge-stack.ts`, CDK app 조립과 infra tests
- `.github/workflows/deploy-production.yml`
- `docs/development/aws-deployment.md`
- `frontend/web/vite.config.ts`와 route code-splitting build test
- route directory의 test file 이름 정리
- `.dockerignore`
- `backend/api/src/common/logging/structured-logger.ts`

다른 작업 단위는 위 파일을 수정하지 않는다.

### 6.2 production web artifact

EdgeStack은 생성자에서 web asset path를 명시적으로 받는다.

- unit test와 fixture synth는 추적된 작은 fixture directory를 주입한다.
- production deploy는 `frontend/web/dist`만 주입한다.
- production dist가 없으면 probe로 fallback하지 않고 배포 전에 실패한다.
- `BucketDeployment`은 전체 dist를 prune하고 `index.html`과 asset
  invalidation을 수행한다.

Workflow는 `VITE_API_BASE_URL=https://api.${ROOT_DOMAIN}/api/v1`으로 web을
먼저 build한 다음 CDK diff와 deploy가 같은 dist를 사용하게 한다.
production artifact에서 probe 문구와 same-origin `/api/v1` 기본값이
사용되지 않는 것을 build 검증으로 확인한다.

### 6.3 CloudFront와 bundle

default와 asset behavior에 같은 security response header policy를
연결한다. HSTS, content type sniffing 차단, frame 차단, referrer policy와
현재 web/API/media에 필요한 최소 CSP를 둔다.

TanStack Router의 route auto code splitting을 켜고 route directory의
일반 test가 route로 스캔되지 않게 파일명을 convention에 맞춘다. build는
500KB를 넘는 application chunk가 없어야 하며 warning threshold를
올려 우회하지 않는다.

### 6.4 secret context와 logger

`.dockerignore`는 `*.pem`, `.worktrees`, `.pnpm-store`, root·workspace
coverage를 제외한다. 검증은 private key의 내용이나 값을 출력하지 않고
basename과 image/context 포함 여부만 확인한다.

StructuredLogger는 Nest의 optional context, stack, variadic parameter를
`unknown[]`으로 받고 plain metadata record만 merge한다. 문자열 context와
Error는 구조화 필드로 제한하고 password, token, authorization, cookie,
secret 값은 문자 단위로 펼치거나 원문 stack으로 기록하지 않는다.

## 7. 통합 순서와 충돌 정책

세 브랜치는 모두 이 설계 문서를 커밋한 뒤의 동일한 local `main`에서
시작한다. 통합 순서는 다음과 같다.

1. local runtime
2. product completion
3. delivery hardening
4. 통합 전용 문서·생성 파일 정리

각 브랜치는 자기 소유 경계 밖 변경이 필요하면 중복 구현하지 않고
통합 담당자에게 전달한다. `shared/contracts/src/index.ts`,
`backend/api/src/app.module.ts`, route tree 같은 조립 파일은 기능별
마지막 커밋으로 격리하고 통합 담당자가 앞선 export를 보존해 해결한다.

## 8. 검증

각 작업은 production code 전에 실패하는 단위·component test를 작성하고
예상한 이유로 RED인지 확인한 뒤 최소 구현으로 GREEN을 만든다.

### 8.1 작업별 검증

- local runtime: config/provider/API/database/worker 관련 Vitest,
  `docker compose config`, isolated project의 fresh·preserve start
- product completion: contracts/domain/API/frontend component tests,
  OpenAPI path와 authentication metadata
- delivery hardening: infra unit test와 synth, production 변수로 Vite
  build, chunk 크기와 artifact 내용 검사

### 8.2 통합 검증

- `CHOKIDAR_USEPOLLING=1 pnpm check`
- `pnpm infra:synth`
- host 3000·5432를 점유한 기존 환경을 유지한 채 FLEX THIA Docker 실행
- `/`, learner login, admin login, role switch
- 어휘·문제·개념 조회와 audio 재생
- 콘텐츠·audio upload
- deterministic 문제·어휘 후보 생성과 관리자 검수
- question draft, TTS 생성·재생, publication readiness와 게시
- preserve restart 후 생성 데이터 유지
- FLEX THIA container만 종료하고 volume 보존
- main clean 여부와 불필요한 build artifact 부재 확인

브라우저 수동 검증은 구현 확인을 위한 실행 절차이며 저장소에 E2E
test나 Playwright 설정을 추가하지 않는다.

## 9. 완료 조건

다음 근거가 모두 있어야 Wave 7과 전체 목표를 완료로 판단한다.

- 세 작업 브랜치의 요구사항별 테스트와 리뷰가 통과했다.
- 통합 `main`의 전체 quality gate가 fresh 실행으로 통과했다.
- 실제 Docker stack에서 관리자와 학습자 주요 흐름을 수동 확인했다.
- upload, signed media, candidate, TTS와 게시 흐름이 local fake만으로
  완료됐다.
- production synth가 실제 Vite dist와 API subdomain 설정을 사용한다.
- 다른 프로젝트 container와 volume이 변경되지 않았다.
- FLEX THIA Docker는 종료됐고 volume은 보존됐다.
- main working tree가 깨끗하고 push·PR은 만들지 않았다.

외부 유료 provider가 없다는 사용자 제약 때문에 production AI·TTS 실제
호출은 완료 조건이 아니다. 대신 미설정 production 호출이 명시적으로
실패하고 local 전체 흐름이 외부 비용 없이 검증되는 것을 완료 조건으로
삼는다.

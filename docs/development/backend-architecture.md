# FLEX THIA 백엔드 목표 아키텍처

- 상태: 승인된 목표 구조
- 기준: 전체 제품 기능
- 적용 방식: 기능별 점진 구현

## 1. 목적

이 문서는 FLEX THIA의 전체 기능이 구현됐을 때도 파일 위치, 책임, 의존성
방향을 일관되게 유지하기 위한 백엔드 구조 기준이다.

목표 구조를 미리 정의한다는 것은 모든 폴더와 코드를 지금 만든다는 뜻이
아니다. 실제 기능을 구현할 때 필요한 파일만 만들고, 새 코드는 이 문서의
경계를 따른다. 기존 코드는 별도 작업 범위에 포함될 때 점진적으로
이동한다.

백엔드 범위는 다음 경로다.

- `backend/api`
- `backend/worker`
- `backend/domain`
- `shared/contracts`
- `backend/database`
- `backend/providers`
- `backend/config`

AWS 리소스 구조는 `infra`가 담당하며, 이 문서의 애플리케이션 폴더
규칙과 구분한다.

## 2. 기본 패턴

백엔드는 **기능 우선 분류와 계층 경계를 함께 사용하는 모듈러
모놀리스**로 구성한다.

- 기능 우선: 모든 패키지에서 `questions`, `vocabulary`처럼 같은 기능
  이름으로 코드를 찾는다.
- 계층 경계: HTTP, 업무 규칙, DB, 외부 서비스 구현을 서로 다른
  workspace에 둔다.
- 점진 구현: 전체 제품의 자리는 정의하지만 아직 구현하지 않는 기능의
  빈 폴더와 추측성 코드는 만들지 않는다.
- 단일 배포 단위: API와 worker를 기능별 마이크로서비스로 분리하지
  않는다.
- 표준 우선: NestJS, TypeScript, PostgreSQL과 AWS의 공식·보편적인
  패턴 중 현재 요구를 해결하는 가장 단순한 방식을 사용한다.
- 과설계 금지: 패턴 적용 자체를 목적으로 계층, 추상화, wrapper,
  repository, event 또는 라이브러리를 추가하지 않는다.

## 3. 전체 제품 모듈 지도

| 모듈 | 소유하는 책임 |
| --- | --- |
| `identity` | 계정, 인증, 역할, 계정 상태, 관리자 권한 |
| `vocabulary` | 어휘·표현, 뜻, 발음, 관계, 중복 판정과 병합 |
| `thai-content` | 문장, 토큰 출현, 표현 범위, 해석·발음·성조 정보 |
| `questions` | 문제 유형, 문제·버전, 블록, 선택지, 정답·해설 |
| `learning` | 문제 풀이·재시도, 저장 문제, 단어장, 단어 연습 |
| `concepts` | 태국 문자·발음·문법 개념 콘텐츠와 버전 |
| `content-production` | JSON·PDF 입력, AI 생성, 검증, 게시 조정, 프리셋 |
| `media` | 음성 자산, TTS 생성·재시도·재사용 |
| `recommendations` | 신규 콘텐츠와 개인 추천 조회 |
| `feedback` | 문제·어휘·문장·음성·개념 오류 신고와 처리 |
| `operations` | 감사 기록, 사용량·비용, 운영 현황 조회 |

다음 이름은 독립 제품 모듈로 사용하지 않는다.

- `uploads`: `content-production`의 입력 수단이다.
- `jobs`: 비동기 실행을 위한 기술 기반이다.
- `admin`: 역할이나 화면 구분이며 도메인 이름이 아니다.
- `utils`, `helpers`, `base`: 책임이 드러나지 않는 공용 수집 폴더로
  만들지 않는다.

`content-production`은 다른 콘텐츠 모듈을 대신 소유하지 않는다. 문제
게시 규칙은 `questions`, 어휘 승인 규칙은 `vocabulary`, 음성 준비
규칙은 `media`가 소유하고 `content-production`은 이 유스케이스들을
조정한다.

## 4. 목표 폴더 구조

```text
backend/
├── api/
│   └── src/
│       ├── identity/
│       ├── vocabulary/
│       ├── thai-content/
│       ├── questions/
│       ├── learning/
│       ├── concepts/
│       ├── content-production/
│       ├── media/
│       ├── recommendations/
│       ├── feedback/
│       ├── operations/
│       ├── health/
│       ├── commands/
│       └── common/
├── worker/
│   └── src/
│       ├── content-production/
│       ├── media/
│       └── common/
├── domain/
│   └── src/
│       ├── identity/
│       ├── vocabulary/
│       ├── thai-content/
│       ├── questions/
│       ├── learning/
│       ├── concepts/
│       ├── content-production/
│       ├── media/
│       ├── recommendations/
│       ├── feedback/
│       └── operations/
├── database/
│   └── src/
│       ├── clients/
│       ├── schema/
│       ├── repositories/
│       ├── queries/
│       └── operations/
├── providers/
│   └── src/
│       ├── identity/
│       ├── storage/
│       ├── messaging/
│       ├── ai/
│       ├── tts/
│       ├── queue/
│       ├── crypto/
│       └── fakes/
└── config/
    └── src/

shared/
└── contracts/
    └── src/
        ├── identity/
        ├── vocabulary/
        ├── thai-content/
        ├── questions/
        ├── learning/
        ├── concepts/
        ├── content-production/
        ├── media/
        ├── recommendations/
        ├── feedback/
        ├── operations/
        └── common/
```

이 트리는 최종 위치를 보여주는 지도다. 구현하지 않는 모듈의 빈
디렉터리를 미리 생성하지 않는다.

## 5. workspace별 책임

### 5.1 `backend/api`

NestJS를 사용하는 HTTP 전달 계층과 의존성 조립 지점이다.

- Controller, Guard, Decorator, Nest Module
- 공개 API 입력을 도메인 명령으로 변환
- 도메인 결과를 공개 응답으로 변환
- 인증된 사용자와 요청 문맥 전달

Controller에 업무 규칙, SQL, AWS SDK 호출을 넣지 않는다. 학습자와
관리자의 공개 범위가 다르면 Controller를 분리한다.

```text
backend/api/src/questions/
├── learner-questions.controller.ts
├── admin-questions.controller.ts
├── question-response.mapper.ts
└── questions.module.ts
```

### 5.2 `backend/worker`

큐와 워크플로 이벤트를 받아 도메인 유스케이스를 호출하는 실행
진입점이다.

- AI 생성과 검증 작업
- TTS 생성과 재시도
- 긴 작업의 상태 전달

worker 파일에 문제 생성 규칙이나 콘텐츠 상태 전이를 중복 구현하지
않는다.

### 5.3 `backend/domain`

프레임워크와 외부 기술을 모르는 핵심 업무 코드다.

- 모델과 값 객체
- 상태 전이와 불변 조건
- 한 가지 사용자 행동을 수행하는 유스케이스
- Repository와 외부 서비스에 요구하는 port
- 도메인 오류

기능이 충분히 커지면 다음 내부 구조를 사용한다.

```text
backend/domain/src/questions/
├── model/
├── application/
├── ports/
└── index.ts
```

파일이 적을 때는 같은 기능 폴더에 평평하게 두고, 실제 책임이 늘어날 때
하위 폴더로 분리한다. 빈 `model`, `application`, `ports` 폴더를 미리
만들지 않는다.

### 5.4 `shared/contracts`

외부에 공개하는 JSON 계약을 Zod schema와 TypeScript 타입으로 정의한다.

- 요청 schema
- 공개 응답 schema
- 페이지네이션과 공통 오류 계약
- 프론트엔드가 안전하게 공유할 타입

DB row나 도메인 객체를 그대로 API 응답으로 노출하지 않는다. 비밀번호,
token, 내부 상태와 정답처럼 공개하면 안 되는 필드는 계약 단계에서
제외한다.

### 5.5 `backend/database`

PostgreSQL과 Drizzle에 한정된 구현을 둔다.

- `schema`: 기능별 테이블 구조
- `repositories`: 도메인 port의 저장 구현
- `queries`: 목록, 검색, 관리자 현황 같은 읽기 전용 조회
- `operations`: migration과 DB 실행 지원
- `clients`: 로컬 PostgreSQL과 Data API 연결

복잡한 조회를 도메인 모델에 억지로 넣지 않는다. 여러 쓰기를 하나의
불변 작업으로 완료해야 하면 repository 구현에서 transaction을
보장한다.

### 5.6 `backend/providers`

DB가 아닌 외부 기술의 adapter를 기능별 능력으로 분류한다.

- `identity`: Cognito
- `storage`: S3와 서명 URL
- `messaging`: SES와 SNS
- `ai`: AI 공급자
- `tts`: 음성 공급자
- `queue`: SQS와 워크플로 실행
- `crypto`: HMAC, token과 code 처리
- `fakes`: 로컬 개발과 단위 테스트용 구현

AWS라는 이유만으로 모든 파일을 `aws` 폴더 하나에 모으지 않는다.
공급자가 바뀌어도 능력의 위치가 유지되도록 분류한다.

### 5.7 `backend/config`

환경 변수 읽기와 검증만 담당한다. 업무 규칙이나 외부 서비스 호출을
넣지 않으며, 애플리케이션 코드가 여러 곳에서 `process.env`를 직접 읽지
않게 한다.

## 6. 의존성 방향

```text
backend/api ───────┬──> shared/contracts
                   ├──> backend/domain
                   ├──> backend/database ──> backend/domain
                   ├──> backend/providers ─> backend/domain
                   └──> backend/config

backend/worker ────┬──> backend/domain
                   ├──> backend/database
                   ├──> backend/providers
                   └──> backend/config
```

필수 규칙은 다음과 같다.

- `backend/domain`은 API, worker, contracts, database, providers, infra를
  import하지 않는다.
- `shared/contracts`는 DB schema와 domain 내부 모델에 의존하지 않는다.
- `database`와 `providers`는 domain이 정의한 port를 구현한다.
- `database`가 `providers`를 호출하거나 그 반대로 연결하지 않는다.
- 실제 구현 조립은 `backend/api`와 `backend/worker`에서 한다.
- 기능 모듈 사이의 호출은 상대 모듈이 공개한 API와 타입만 사용한다.

## 7. 파일 배치 판단

| 작성하려는 코드 | 위치 |
| --- | --- |
| HTTP route와 인증 Guard | `backend/api/src/<기능>` |
| API 요청·응답 Zod schema | `shared/contracts/src/<기능>` |
| 상태 전이와 업무 규칙 | `backend/domain/src/<기능>` |
| DB 테이블 | `backend/database/src/schema` |
| 도메인 repository 구현 | `backend/database/src/repositories/<기능>` |
| 검색·목록 전용 DB 조회 | `backend/database/src/queries/<기능>` |
| Cognito·S3·AI·TTS adapter | `backend/providers/src/<능력>` |
| 비동기 이벤트 진입점 | `backend/worker/src/<기능>` |
| 환경 변수 schema | `backend/config/src` |

한 곳에서만 쓰는 파일은 사용하는 기능 폴더 가까이에 둔다. 미래에
공유할 가능성만으로 `common`이나 별도 추상화를 만들지 않는다.

## 8. 코드 품질 규칙

- 모든 새 코드와 변경 코드는
  `conventions/comment-convention.md`의 파일 헤더, export JSDoc과 내부 주석
  규칙을 준수한다.
- 파일과 export 이름은 소유 기능과 책임이 드러나게 작성한다.
- 하나의 유스케이스는 한 가지 사용자 행동만 수행한다.
- Controller와 worker handler는 얇게 유지한다.
- 도메인 규칙을 Controller, repository, worker에 복제하지 않는다.
- 테스트는 대상 파일 옆에 둔다.
- 패키지와 모듈의 `index.ts`는 외부에 허용할 항목만 공개한다.
- 순환 의존성이 생기면 공용 폴더로 옮기기 전에 소유권과 호출 방향을
  다시 설계한다.
- 파일 길이만으로 분리하지 않고 서로 다른 변경 이유가 있을 때
  분리한다.
- 모든 테이블에 기계적으로 repository를 만들지 않는다.
- 읽기 모델과 쓰기 모델이 실제로 달라질 때만 `queries`를 별도로
  사용한다.
- 새 라이브러리는 현재 요구를 기존 의존성이나 짧은 코드로 안전하게
  해결할 수 없을 때만 추가한다.
- 표준 패턴이 여러 개라면 팀이 이해하기 쉬우며 마법과 암묵적 동작이
  적은 방식을 선택한다.

## 9. 현재 구조에서의 점진 전환

현재 코드는 목표 구조의 기초를 이미 사용한다. 다음 변경은 관련 기능을
구현하거나 수정하는 별도 작업에서만 수행한다.

- `auth`는 최종적으로 `identity` 경계 안에서 인증과 권한으로 정리한다.
- `uploads`는 `content-production`의 입력 기능으로 이동한다.
- 일반적인 `jobs` 이름 대신 실제 작업 소유자인 `content-production`이나
  `media`에서 유스케이스를 찾을 수 있게 한다.
- `providers/aws`는 외부 능력별 폴더로 점진 이동한다.
- 커지는 `app.module.ts`의 조립 책임은 기능별 Nest Module로 나눈다.
- API 계약은 Controller 내부 타입 대신 `shared/contracts`로 이동한다.

목표 구조와 다르다는 이유만으로 현재 파일을 한꺼번에 이동하거나
리팩터링하지 않는다. 새 설계에 직접 관련된 파일만 변경하고, 이동에는
관련 import와 테스트 검증을 포함한 별도 계획을 둔다.

## 10. 문서 우선순위

- 이 문서: 새 백엔드 코드의 목표 구조와 배치 규칙
- `docs/superpowers/specs/2026-07-23-backend-mvp-domain-erd-api-design.md`:
  MVP 도메인, 상태 전이, ERD와 API 계약
- `docs/development/project-structure.md`: 현재 저장소를 이해하기 위한
  설명
- `docs/superpowers/specs`: 기능과 설계 결정의 배경
- 현재 코드와 테스트: 실제 구현 여부

기능 요구사항과 이 문서가 충돌하면 임의로 한쪽을 적용하지 않고 설계
결정을 먼저 갱신한다.

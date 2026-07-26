# Wave 2 Parallel Delivery Design

## 1. 목적

Wave 2는 Wave 1에서 완성한 복수 단어장과 태국어 상호작용 위에 다음
세 기능을 동시에 구현한다.

- `vocabulary-practice`
- `concept-learning`
- `content-feedback`

세 기능은 각각 계약, 도메인, 전용 DB 파일, API 모듈과 화면을 독점한다.
application root, migration, 생성 route tree처럼 순서가 필요한 파일은
기능 브랜치에서 수정하지 않고 통합 브랜치가 한 번만 조립한다.

이 문서는 이미 승인된 전체 제품 설계를 분해한다. 새로운 제품 범위를
추가하지 않는다.

## 2. 공통 결정

### 2.1 기준선

- 세 기능 브랜치는 Wave 1 검증이 끝난 local `main`의 같은 commit에서
  생성한다.
- 기능 브랜치 이름은 `codex/vocabulary-practice`,
  `codex/concept-learning`, `codex/content-feedback`으로 고정한다.
- 각 브랜치는 다른 기능의 내부 파일을 import하거나 수정하지 않는다.
- 기능 브랜치는 새 패키지, 환경 변수, AWS 리소스를 추가하지 않는다.
- 테스트는 Vitest 단위·컴포넌트 테스트만 추가하고 E2E를 만들지 않는다.

### 2.2 데이터와 migration

- 연습은 `learning-practice.schema.ts`, 개념은 `concepts.schema.ts`,
  신고는 `feedback.schema.ts`를 각각 독점한다.
- 기능 브랜치는 schema 파일과 schema 단위 테스트만 작성한다.
- `backend/database/src/schema/index.ts`, Drizzle migration SQL, snapshot,
  journal은 통합 담당자가 세 기능을 정해진 순서로 생성한다.
- migration 순서는 연습, 개념, 신고다. 신고가 개념 식별자를 참조하더라도
  polymorphic target에 DB 외래 키를 만들지 않고 서버 검증과 immutable
  snapshot을 함께 사용한다.

### 2.3 공개 식별자

- 브라우저는 signed audio URL이나 임의 media ID를 신고 식별자로 보내지
  않는다.
- 어휘 연습과 신고는 이미 공개된 vocabulary, meaning, pronunciation,
  wordbook 식별자를 사용한다.
- 개념 상세는 concept, version, block, sentence version 식별자를 공개해
  같은 Wave의 신고 기능이 나중에 연결될 수 있게 한다.
- 신고 API는 target별 origin 식별자를 받아 서버에서 관계를 확인하고,
  제출 시점의 표시 문맥을 snapshot으로 저장한다.

### 2.4 검증과 AI 경계

- 이 Wave의 개념 검증은 필수 제목·블록·표 구조, 참조 문장 존재,
  게시 가능한 음성 상태 같은 결정적 규칙을 검사한다.
- 외부 AI 사실 검증 호출은 Wave 3의 작업 기반과 후속 AI adapter가
  준비된 뒤 같은 validation port에 추가한다.
- 결정적 검증을 통과하지 못한 개념 버전은 게시할 수 없다.
- 로컬 테스트용 게시 콘텐츠에 placeholder 문구를 넣지 않는다.

### 2.5 콘텐츠 수정 연결

- 신고 접수는 콘텐츠를 자동으로 숨기거나 수정하지 않는다.
- 신고 모듈은 상태, 담당자와 append-only 처리 이력을 소유한다.
- 수정·숨김·재검증은 대상 콘텐츠의 관리자 화면으로 가는 검증된
  deep link로 연결한다.
- 대상 도메인의 write use case를 신고 모듈에서 호출하거나 복제하지
  않는다.

## 3. 브랜치별 소유권

| 브랜치 | 독점 경로 | 금지된 공통 경로 |
| --- | --- | --- |
| vocabulary-practice | `shared/contracts/src/learning/practice*`, `backend/domain/src/learning/*practice*`, `backend/database/src/schema/learning-practice.schema.ts`, practice repository/query, `backend/api/src/learning/*practice*`, practice pages/features | `learning.module.ts`, `app.module.ts`, migration/meta, learner navigation, route files/tree, local seed |
| concept-learning | `shared/contracts/src/concepts/**`, `backend/domain/src/concepts/**`, `backend/database/src/schema/concepts.schema.ts`, concept repository/query, `backend/api/src/concepts/**`, concept pages/features | `app.module.ts`, migration/meta, navigation, route files/tree, local seed |
| content-feedback | `shared/contracts/src/feedback/**`, `backend/domain/src/feedback/**`, `backend/database/src/schema/feedback.schema.ts`, feedback repository/query, `backend/api/src/feedback/**`, report feature/admin pages | `app.module.ts`, migration/meta, navigation, route files/tree, local seed, 기존 콘텐츠 화면 |

각 브랜치의 package 공개 export는 독립 typecheck에 필요할 때 별도 마지막
commit으로만 추가한다. 통합 담당자는 이 작은 append-only 충돌을 먼저
해결하고 다른 공통 조립을 시작한다.

## 4. 기능 간 계약

### 4.1 단어장과 연습

- 연습 시작 시 서버가 사용자 소유 단어장과 현재 항목을 다시 검증한다.
- 선택한 항목은 세션 생성 시 순서와 출제 정보를 snapshot으로 고정한다.
- 세션 중 단어장이나 공용 어휘가 바뀌어도 이미 시작한 세션 기록은
  덮어쓰지 않는다.

### 4.2 개념과 태국어 콘텐츠

- 개념 예시는 기존 immutable Thai sentence version을 참조한다.
- 개념 모듈은 태국어 token·expression SQL과 signed media URL 조립을
  복제하지 않는다.
- 통합 단계에서 `thai-content`가 소유하는 재사용 sentence projection을
  공개하고 learning과 concepts가 함께 소비하게 한다.

### 4.3 개념과 신고

- 신고 브랜치는 concept 내부 구현에 의존하지 않는다.
- 공통 신고 target 계약은 concept ID, version ID, block ID와 선택적인
  sentence version ID만 받는다.
- 통합 단계에서 concept target resolver를 신고 모듈에 주입한다.

## 5. 통합 순서

1. 세 기능 브랜치의 독립 테스트와 workspace typecheck를 통과시킨다.
2. 코드 리뷰에서 다른 브랜치 소유 파일과 공통 금지 파일 변경을 확인한다.
3. `vocabulary-practice`를 통합 브랜치에 병합한다.
4. `concept-learning`을 병합하고 공용 Thai sentence projection을 연결한다.
5. `content-feedback`을 병합하고 concept target resolver를 연결한다.
6. package barrels, Nest root/module 조립과 OpenAPI active paths를 갱신한다.
7. schema export 후 migration을 연습, 개념, 신고 순으로 생성한다.
8. learner/admin route와 navigation을 추가하고 route tree를 한 번 생성한다.
9. 로컬 seed에 연습 가능한 어휘·단어장, 두 개념 카테고리의 실제 게시
   콘텐츠, 상태별 신고 사례를 추가한다.
10. 빈 PostgreSQL migration, Wave 1 DB upgrade, reset/seed를 실제
    PostgreSQL에서 확인한다.
11. 전체 lint, typecheck, test, coverage, build, CDK test/synth를 실행한다.
12. 최신 컨테이너를 다시 build하고 learner/admin 브라우저 smoke를
    수행한다.

## 6. 공통 완료 조건

- learner가 단어장 또는 어휘 선택에서 연습을 시작하고 세 가지 초기
  방식으로 답안과 결과를 저장할 수 있다.
- learner가 두 개념 카테고리의 게시 카드와 상세 블록을 보고 태국어
  예시 상호작용을 사용할 수 있다.
- admin이 개념 초안, 검증, 게시, 숨김과 버전을 관리할 수 있다.
- learner가 지원되는 모든 콘텐츠 위치에서 같은 오류 신고 흐름을
  사용하고 admin이 담당자·상태·이력을 관리할 수 있다.
- 신고는 대상 콘텐츠 상태를 자동 변경하지 않는다.
- 세션, 답안, 신고와 처리 이력은 원시 기록으로 보존된다.
- `pnpm check`와 production build가 통과한다.
- Docker local API, web, PostgreSQL이 healthy이고 고정 로컬 인증으로
  기능을 수동 검증할 수 있다.

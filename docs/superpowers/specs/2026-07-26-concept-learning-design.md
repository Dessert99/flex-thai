# Concept Learning 기능 설계

- 작성일: 2026-07-26
- 상태: 승인된 전체 제품 기획의 Wave 2 구체화
- 소유 모듈: `concepts`
- 기준 브랜치: Wave 1 통합 이후 최신 `main`

## 1. 목적

태국 문자·발음과 문법 개념을 게시 가능한 불변 버전 콘텐츠로 관리하고,
학습자가 카드 홈과 블록형 상세 화면에서 읽을 수 있게 한다. 태국어
예시는 기존 문장·단어·표현·음성 상호작용을 재사용한다.

이 기능은 개념 퀴즈, 사용자별 진도, 숙련도, 학습 중 AI 호출을 만들지
않는다.

## 2. 확정 사용자 기능

### 2.1 학습자

- 개념 홈은 `태국 문자·발음`, `문법` 두 영역을 탭으로 구분한다.
- 선택한 영역의 게시 개념을 교육 순서와 제목 순으로 카드에 표시한다.
- 카드는 제목과 짧은 요약을 제공한다.
- 상세는 현재 게시 버전만 표시한다.
- 상세 목차는 순서가 있는 블록의 제목에서 파생한다.
- 블록 종류는 설명, 규칙 표, 태국어 예시 세 가지다.
- 태국어 예시는 기존 `InteractiveThaiSentence`를 사용해 단어·표현
  피드백과 저장 음성을 제공한다.
- 미게시·숨김·존재하지 않는 개념은 공개 상세에서 같은 404로 처리한다.

### 2.2 관리자

- 개념과 첫 초안을 함께 만든다.
- 개념 목록에서 영역, 공개 상태, 최신 버전, 검증 상태를 확인한다.
- 하나의 초안 버전에서 메타데이터와 블록 전체를 원자 교체한다.
- 게시 버전을 직접 수정하지 않고 새 초안을 복제해 수정한다.
- 초안을 검증하고 경로별 오류와 한국어 근거를 확인한다.
- 검증을 통과한 초안만 게시한다.
- 새 버전을 게시하면 이전 게시 버전은 `RETIRED`가 된다.
- 게시 개념을 숨기고, 유효한 현재 게시 버전이 있을 때만 복구한다.
- 생성·교체·검증·게시·숨김·복구를 감사 기록에 남긴다.

관리 API는 기존 관리자 콘텐츠 API와 동일하게 access token, `ADMIN`
역할, TOTP 등록을 요구한다.

## 3. 명시적 제외

- 개념 퀴즈, 진도율, 완료 표시, 숙련도 계산
- 사용자별 개념 학습 기록
- 학습 화면의 실시간 AI 호출
- Markdown·HTML 원문 저장과 임의 HTML 렌더링
- 개념 편집 화면에서 새로운 태국어 문장 버전 생성
- AI·TTS 공급자 선택과 adapter 구현
- migration, seed, route tree와 root 애플리케이션 조립

초기 교육 본문과 실제 AI 공급자는 승인 문서에서도 별도 운영값이다.
기능 브랜치는 구조와 fake 기반 검증을 완성하고, 통합 담당자가 승인된
초기 콘텐츠와 production validator를 연결한다.

## 4. 콘텐츠 모델

### 4.1 상태

논리 개념 상태:

- `DRAFT`: 게시 이력이 없는 개념
- `PUBLISHED`: 현재 게시 버전이 학습자에게 노출됨
- `HIDDEN`: 현재 게시 버전을 보존한 채 학습자 노출만 중단함

개념 버전 상태:

- `DRAFT`: 교체와 검증이 가능한 유일한 가변 상태
- `PUBLISHED`: 현재 또는 과거에 게시된 불변 버전
- `RETIRED`: 새 게시 버전으로 교체된 불변 버전

검증 상태:

- `PENDING`: 생성 또는 교체 뒤 아직 검증하지 않음
- `PASSED`: 현재 revision이 구조·참조·외부 검증을 통과함
- `FAILED`: 현재 revision에 하나 이상의 검증 문제가 있음

영역:

- `THAI_SCRIPT_PRONUNCIATION`
- `GRAMMAR`

블록:

- `EXPLANATION`
- `RULE_TABLE`
- `THAI_EXAMPLES`

### 4.2 테이블

`concepts`

- `id`
- `status`
- `current_published_version_id`
- `created_at`
- `updated_at`

`concept_versions`

- `id`, `concept_id`, `version`
- `category`, `position`, `title`, `summary`
- `status`, `revision`
- `validation_status`, `validation_issues`
- `validated_at`, `published_at`
- `created_at`, `updated_at`

한 개념에는 `DRAFT` 버전이 최대 하나만 존재한다. `(concept_id, version)`
은 유일하며 `revision`은 초안 전체 교체마다 증가한다.

`concept_blocks`

- `id`, `concept_version_id`
- `kind`, `position`, `heading`
- `paragraphs`
- `table_headers`
- `table_rows`

설명은 비어 있지 않은 문단 배열, 규칙 표는 비어 있지 않은 헤더와 같은
열 수의 행 배열을 사용한다. 태국어 예시 블록은 세 payload 열을 모두
비워 둔다. `(concept_version_id, position)`은 유일하다.

`concept_block_examples`

- `id`, `block_id`, `position`
- `sentence_version_id`
- `note_ko`

`sentence_version_id`는 불변 `thai_sentence_versions`를 참조한다.
`(block_id, position)`은 유일하다.

목차는 저장하지 않는다. 공개 응답에서 블록 ID, 제목과 순서로 만든다.

## 5. 불변 조건과 상태 전이

### 5.1 초안 생성과 교체

- 개념 생성은 논리 개념과 version 1 초안을 한 transaction에서 만든다.
- 새 버전은 현재 게시 버전 또는 최신 버전을 복제해 다음 번호 초안으로
  만든다.
- 이미 초안이 있으면 새 버전을 만들지 않고 충돌을 반환한다.
- 전체 교체는 요청 `revision`과 저장 revision이 같을 때만 실행한다.
- 전체 교체는 기존 블록과 예시를 교체하고 revision을 1 증가시키며 검증
  상태와 이슈를 `PENDING`, 빈 배열로 초기화한다.
- 게시·은퇴 버전은 교체할 수 없다.

### 5.2 검증

도메인 구조 검증은 다음을 확인한다.

- 제목, 요약과 모든 블록 제목이 비어 있지 않음
- 블록과 예시 position이 0부터 끊김 없이 이어짐
- 설명 블록에 비어 있지 않은 문단이 있음
- 규칙 표에 헤더와 행이 있고 모든 행의 열 수가 헤더와 같음
- 태국어 예시 블록에 하나 이상의 예시가 있음
- 같은 블록에서 문장 버전을 중복 참조하지 않음
- 참조 문장 버전, token, expression과 음성 자산이 존재함
- 예시 문장 음성 자산이 `READY`임

`ConceptContentValidator` port는 현재 revision의 외부 검증 문제와 한국어
근거를 반환한다. 기능 브랜치 테스트는 deterministic fake를 사용한다.
production adapter 선택과 조립은 통합 선행 조건이다.

외부 호출 동안 초안이 바뀔 수 있으므로 검증 저장은 `versionId`와
`expectedRevision`이 모두 일치할 때만 성공한다. 불일치하면 최신 초안을
다시 검증하도록 409를 반환한다.

### 5.3 게시·숨김·복구

- publish는 같은 revision의 `PASSED` 검증 결과가 있는 `DRAFT`에만
  허용한다.
- publish transaction은 기존 게시 버전을 `RETIRED`로 바꾸고, 초안을
  `PUBLISHED`로 바꾸며, 논리 개념의 현재 버전과 상태를 갱신한다.
- publish는 참조한 문장 버전을 동결한다.
- hide는 `PUBLISHED` 개념만 `HIDDEN`으로 바꾼다.
- restore는 현재 버전이 `PUBLISHED`인 `HIDDEN` 개념만 복구한다.
- 모든 상태 전이는 영향 행 수가 정확히 1이 아니면 persistence conflict로
  실패한다.

## 6. 공개 계약과 API

### 6.1 학습자 API

`GET /api/v1/concepts`

- query: `category`
- success: `200 ConceptListResponse`
- errors: `400`, `401`, `403`, `500`

`GET /api/v1/concepts/:conceptId`

- success: `200 ConceptDetailResponse`
- errors: `400`, `401`, `403`, `404`, `500`

목록과 상세는 `PUBLISHED`만 반환한다. 상세의 `THAI_EXAMPLES` 항목은
`publicThaiSentenceSchema`를 포함하며 API service가 media storage key를
서명 URL로 변환한다.

### 6.2 관리자 API

- `GET /api/v1/admin/concepts`
- `POST /api/v1/admin/concepts`
- `GET /api/v1/admin/concepts/:conceptId`
- `POST /api/v1/admin/concepts/:conceptId/versions`
- `PUT /api/v1/admin/concept-versions/:versionId`
- `POST /api/v1/admin/concept-versions/:versionId/validate`
- `POST /api/v1/admin/concept-versions/:versionId/publish`
- `POST /api/v1/admin/concepts/:conceptId/hide`
- `POST /api/v1/admin/concepts/:conceptId/restore`

생성·새 버전·전체 교체는 버전 응답을 반환한다. validate는 검증 보고서를
반환한다. publish, hide, restore는 `204`다.

공통 오류 의미:

- `400`: strict 계약 또는 블록 구조가 잘못됨
- `401`: 인증 실패
- `403`: 역할, 계정 상태 또는 TOTP 조건 실패
- `404`: 개념, 버전 또는 참조 문장을 찾을 수 없음
- `409`: revision, 상태 전이, 단일 초안 또는 persistence 충돌
- `500`: 예상하지 못한 서버 오류

## 7. 백엔드 경계

`backend/domain/src/concepts`는 모델, 구조 검증, 상태 전이 use case,
repository port와 외부 validator port를 소유한다.

`backend/database`는 다음을 구현한다.

- 초안과 게시 상태 전이를 원자 처리하는 admin repository
- 관리자 모든 상태·버전 read query
- 학습자 현재 게시 버전 read query
- 태국어 예시의 기존 문장 projection 조회

`backend/api/src/concepts`는 다음을 소유한다.

- learner/admin controller
- media URL과 공개 계약을 조립하는 concept service
- `ConceptsModule.register`

Controller는 SQL, 상태 전이, 음성 URL 서명 규칙을 갖지 않는다.

## 8. 프론트엔드 경계

전용 slice:

- `pages/concept-list`
- `pages/concept-detail`
- `pages/concept-management`
- `pages/admin-concept-detail`

한 관리자 상세 화면에서만 사용하는 블록 편집 상태는
`pages/admin-concept-detail`에 둔다. 실제 두 화면에서 재사용되기 전에는
별도 공용 feature나 shared editor를 만들지 않는다.

학습자 상세는 semantic heading과 anchor, `table`, `lang="th"`를
사용한다. 예시 문장은 `InteractiveThaiSentence`를 import한다. 로딩, 빈
상태, 오류와 재시도는 기존 page-state UI를 사용한다.

관리자 편집기는 원시 HTML 입력을 제공하지 않는다. 블록 종류에 맞는
문단, 헤더·행, 기존 sentence version ID와 한국어 메모만 편집한다.
저장 시 최신 revision을 전송하고 409면 서버 최신 상태 재조회 안내를
표시한다.

## 9. 병렬 소유권

기능 브랜치가 독점 소유하는 경로:

- `backend/domain/src/concepts/**`
- `backend/api/src/concepts/**`
- `backend/database/src/schema/concepts.schema.ts`
- `backend/database/src/schema/concepts.schema.spec.ts`
- `backend/database/src/repositories/drizzle-concept*.ts`
- `backend/database/src/queries/drizzle-concept*.ts`
- `shared/contracts/src/concepts/**`
- concept 전용 frontend page slice

통합 담당자만 변경하는 파일:

- `backend/api/src/app.module.ts`
- `backend/database/src/schema/index.ts`
- workspace root export `index.ts`의 최종 합본
- `backend/api/src/openapi/openapi.dto.ts`
- `backend/api/src/openapi/openapi.spec.ts`
- `backend/database/drizzle/**`
- migration meta·snapshot·journal
- app route 파일과 `routeTree.gen.ts`
- learner/admin navigation
- seed와 local reset

기능 브랜치는 독립 typecheck에 필요한 자기 기능 export만 마지막 단독
commit으로 추가할 수 있고, 통합 담당자가 세 브랜치의 export를 합친다.
그 밖의 공통 파일 변경은 handoff 목록으로 전달한다.

## 10. 선행·통합 조건

- 승인된 초기 본문과 READY 음성을 참조하는 example sentence seed가
  필요하다.
- 공용 sentence projection과 media response assembler의 소유권을
  `thai-content`에 둘지 concepts 전용 query로 허용할지 통합 담당자가
  결정해야 한다. 다른 learning query의 private 구현을 import하지 않는다.
- production `ConceptContentValidator` adapter와 설정이 없으면 production
  게시 조립은 fail-closed해야 한다.
- 병렬 `content-feedback`은 concept ID, version ID, block ID만 공개
  계약으로 소비하고 concepts schema를 변경하지 않는다.

## 11. 검증 원칙

- 계약, 구조 검증, 상태 전이, transaction과 UI 행동을 Vitest 단위·
  컴포넌트 테스트로 검증한다.
- DB integration test는 로컬 PostgreSQL이 있을 때 repository transaction을
  검증하되 API E2E 테스트를 만들지 않는다.
- 모든 테스트 설명은 한국어다.
- E2E runner, spec, 설정을 추가하지 않는다.

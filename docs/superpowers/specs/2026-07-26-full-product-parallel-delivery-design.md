# FLEX THIA 전체 제품 병렬 구현·통합 설계

- 작성일: 2026-07-26
- 상태: 작성 완료·사용자 검토 요청
- 기준 브랜치: `origin/main`
- 동시 작업 수: 최대 3개

## 1. 목적

현재 완료된 MVP를 기준으로 통합 제품 기획의 전체 목표 기능을 구현한다.
기능은 충돌이 적은 세로 단위로 나누고, 최대 세 개의 독립 worktree에서
동시에 작업한다. 각 기능은 도메인 규칙, 공개 API, 저장소 구현,
프론트엔드, 테스트까지 하나의 책임으로 완성한다.

모든 기능이 완료되면 최신 `main`에 순차 통합하고 사용자가 로컬에서
관리자와 학습자 계정으로 실제 동작을 확인할 수 있는 환경을 제공한다.

이 설계에는 달력 일정이나 완료 날짜를 두지 않는다. 다음 Wave 진입은
시간이 아니라 이전 Wave의 검증 결과로 결정한다.

## 2. 기준 문서와 현재 기준선

제품 요구사항은 다음 문서를 기준으로 한다.

- `docs/superpowers/specs/2026-07-16-thai-flex-learning-service-design.md`
- `docs/development/backend-architecture.md`
- `conventions/structure-convention.md`
- `conventions/frontend/component-convention.md`
- 현재 `shared/contracts`와 활성 API·프론트엔드 구현

설계 시점의 `feat/frontend`, `origin/main`, 원격 `main`은 모두
`5ee4f8a0339b963ab5e0e7242e8dc1213e92fe57`을 가리킨다. 로컬 `main`은
뒤처져 있으므로 실행을 시작하기 전에 원격 `main`으로 fast-forward한다.

기존 `/private/tmp/flex-thia-fix-ci-root-esbuild` worktree는 기준선보다
뒤처졌고 고유 커밋이 없는 prunable 항목이다. 새 Wave의 기준으로
사용하지 않는다.

## 3. 아직 확정해야 하는 제품 운영값

전체 제품의 기능 목표는 확정되어 있지만 다음 값은 구현 전에 별도
기능 설계에서 결정한다.

- AI·OCR·TTS 공급자와 모델
- 인증 코드 만료와 재전송 제한
- 추천 활성화 기준과 규칙 가중치
- 초기 개념 학습 본문
- 문제 유형별 승인 예시와 난이도 판정표
- TTS 화자 프리셋
- AI·TTS 비용 경고 기준

외부 유료 공급자 선택, 새 패키지 설치, 실제 비밀 입력은 사용자 승인을
받는다. 로컬과 테스트 환경은 공급자 fake를 사용해 비용 없이 검증할 수
있어야 한다.

## 4. 병렬화 원칙

### 4.1 세로 기능 단위

각 기능 브랜치는 필요한 범위에서 다음 계층을 함께 소유한다.

- `backend/domain/src/<기능>`
- `backend/api/src/<기능>`
- `backend/worker/src/<기능>`
- 기능별 DB schema·repository·query
- 기능별 provider adapter
- `shared/contracts/src/<기능>`
- `frontend/web/src/pages/<기능>`
- `frontend/web/src/features/<기능>`
- 기능별 단위·컴포넌트 테스트

프론트엔드와 백엔드를 별도 브랜치로 나누지 않는다. 한 기능의 계약과
사용자 동작을 한 브랜치에서 검증한다.

### 4.2 직렬 통합 파일

기능 브랜치가 단독으로 typecheck와 기능 테스트를 통과하려면 공개
export와 애플리케이션 조립이 필요하다. 다음 작은 조립 파일의 변경은
기능 브랜치의 마지막 단일 커밋에만 모은다.

- `backend/api/src/app.module.ts`
- `backend/database/src/schema/index.ts`
- `shared/contracts/src/index.ts`
- 전역 내비게이션과 라우터 조립 파일

통합 담당자는 이 마지막 조립 커밋을 별도로 검토하고, 앞서 병합된
기능과 충돌하면 같은 공개 항목을 보존하며 해결한다.

다음 충돌이 큰 생성·의존성 파일은 병렬 기능 브랜치가 커밋하지 않는다.

- `backend/database/drizzle/**`
- `frontend/web/src/routeTree.gen.ts`
- root와 workspace `package.json`
- `pnpm-lock.yaml`
- 공용 환경 변수와 CDK 실행 조립 파일

새 패키지와 공용 환경은 Wave 시작 전 직렬 기반 변경으로 반영한다.
기능 브랜치에서는 route tree를 로컬 검증에 생성할 수 있지만 커밋하지
않는다. 통합 담당자가 기능을 하나씩 병합한 뒤 migration과 route tree를
순차적으로 생성한다.

### 4.3 공유 변경 발견

기능 구현 중 다른 브랜치의 계약, 공용 테이블, 새 패키지, 새 환경 변수,
AWS 리소스, `shared/ui`, 다른 도메인의 공개 port 변경이 필요하면
임의로 중복 구현하지 않는다.

통합 담당자는 다음 중 하나를 선택한다.

1. 독립성이 유지되면 해당 기능의 소유 범위를 명시적으로 확장한다.
2. 짧은 기반 변경을 먼저 병합하고 dependent 브랜치를 rebase한다.
3. 의존 기능을 다음 Wave로 이동한다.

## 5. Wave 구성

모든 Wave 브랜치는 이전 Wave가 완전히 통합된 최신 `origin/main`에서
생성한다. 독립성이 없는 작업을 세 번째 슬롯을 채우기 위해 억지로
병렬화하지 않는다.

### 5.1 Wave 0: 구현 준비

논리 작업명: `full-product-roadmap-foundation`

- 전체 기능별 소유 모듈과 공개 API 경계 확정
- 각 기능의 별도 설계와 완료 조건 정의
- AI·OCR·TTS·이메일 공급자 결정
- 필요한 패키지와 버전 승인
- migration과 생성 파일 운영 규칙 고정
- 초기 운영 콘텐츠와 설정 입력 형식 결정

빈 미래 모듈이나 추측성 코드는 만들지 않는다.

### 5.2 Wave 1: 사용자 핵심 기능

#### `passwordless-identity`

- 학교 이메일 가입·로그인 통합
- 이메일 링크와 6자리 코드
- 링크 확인 뒤 세션 생성
- 재전송 제한과 만료 안내
- 베타 사용자 초대·관리
- Cognito·SES production adapter와 local fake
- 인증 화면 교체와 세션 복구

소유 모듈은 `identity`와 messaging provider다.

#### `thai-learning-interactions`

- 태국어 단어·표현의 호버, 포커스, 탭 피드백
- 문맥상 뜻, 한국어 발음, 성조 기호
- 단어·표현 음성 재생
- 문장 번호 주석과 문장 음성
- 모바일과 키보드 접근성
- `INLINE_SPAN_CHOICE` 문제 유형

소유 모듈은 `thai-content`와 문제 표시 Feature다.

#### `multiple-wordbooks`

- 여러 개인 단어장 생성·이름 변경·삭제
- 같은 공용 어휘의 여러 단어장 저장
- 항목 검색·필터·페이지네이션
- 선택 항목 이동·복사·제거
- 단어 연습 진입

소유 범위는 `learning`의 단어장 영역이다.

### 5.3 Wave 2: 학습 확장

#### `vocabulary-practice`

- 공용 검색 또는 개인 단어장 출처
- 태국어→한국어, 한국어→태국어, 음성→정답
- 문항 수와 출제 순서 설정
- 연습 진행과 즉시 피드백
- 세션 결과
- 세션과 답안 원시 기록

`multiple-wordbooks`에 의존한다.

#### `concept-learning`

- 태국 문자·발음과 문법 개념 홈·상세
- 목차, 설명, 규칙 표, 태국어 예시 블록
- 공통 태국어 상호작용
- 관리자 블록 편집
- 검증·게시·숨김·버전

소유 모듈은 `concepts`다.

#### `content-feedback`

- 문제·어휘·문장·음성·개념 공통 오류 신고
- 콘텐츠 종류, 버전, 위치 자동 첨부
- 신고 분류와 선택 설명
- 관리자 상태·담당자·처리 이력
- 수정·숨김·재검증 흐름 연결

소유 모듈은 `feedback`이다.

### 5.4 Wave 3: 자동화 기반과 독립 도메인

#### `content-production-foundation`

- TEXT·PDF·IMAGE 입력
- 임시 파일 업로드와 보관 정책
- 생성 목적과 프리셋 저장
- 작업·항목 상태
- queue와 worker 실행 기반
- 멱등 요청, 부분 실패, 재시도 기반
- AI와 TTS가 사용할 안정된 작업 port

실제 AI·OCR·TTS 호출은 이 단계에 포함하지 않는다.

#### `personal-recommendations`

- 기록 부족 시 신규·최근 콘텐츠 fallback
- 문제 풀이, 첫 오답, 저장, 단어장, 연습 기록 입력
- 규칙 기반 문제·어휘 추천
- 추천 이유
- 숨김·무효·비공개 콘텐츠 제외
- 학습자 홈 연결

소유 모듈은 `recommendations`다.

#### `vocabulary-relations-merge`

- 유의어·반의어·관련어 편집
- 정확·의심 중복 비교
- 대표 어휘 선택
- transaction 기반 참조 이동
- 동시 변경 충돌 차단
- 병합·변경 감사 기록

소유 모듈은 `vocabulary`다.

### 5.5 Wave 4: 콘텐츠 생성과 운영 설정

#### `ai-vocabulary-production`

- PDF·IMAGE OCR과 TEXT 입력 처리
- AI 어휘 추출
- 정확 중복과 의심 중복 분리
- 결정 규칙 검증
- 독립 AI 교차 검증
- 정상·주의·실패 후보 저장
- 공급자·모델·프롬프트·사용량 기록

Wave 3의 어휘 공개 API만 사용하고 `vocabulary` 내부를 직접 참조하지
않는다.

#### `question-taxonomy-settings`

- 문제 유형과 유형 버전
- 난이도 기준
- 분류·태그
- 유형별 구조와 출제 규칙
- 승인 예시 문제
- 관리자 설정 화면

소유 모듈은 `questions`다.

#### `user-audit-operations`

- 사용자 검색과 상태 관리
- 역할 변경
- 관리자 OTP 상태
- 감사 기록 검색과 상세
- 최근 운영 변경 이력

소유 모듈은 `identity`와 `operations`다.

### 5.6 Wave 5: 문제 생성과 TTS

이 Wave는 두 브랜치만 병렬 실행한다.

#### `ai-question-production`

- 공통 원칙과 유형별 규칙의 프롬프트 조립
- 목표·필수·제외 어휘 반영
- 신규 문제와 해설 생성
- 유사도·결정 규칙 검사
- 독립 AI 교차 검증
- 정상·주의·실패 후보
- 재생성·폐기

#### `automated-tts`

- 어휘 발음과 문장 음성 생성
- 같은 발음·문장의 음성 재사용
- 일괄·개별 재시도
- 항목별 대기·처리·성공·실패
- provider timeout과 반복 실패
- 콘텐츠 검증 상태와 TTS 상태 분리
- 필수 음성 미준비 시 게시 차단

worker 경로는 각각 `content-production`과 `media`가 소유한다. Wave 3에서
고정한 공용 dispatcher와 작업 schema를 두 브랜치가 동시에 변경하지
않는다.

### 5.7 Wave 6: 관리자 자동화 UI

#### `content-production-console`

- 새 AI 생성 작업
- 빠른 생성과 고급 설정
- 프롬프트 확인과 한국어 추가 지시
- 작업 내역과 결과
- 정상·주의·실패 그룹
- 일괄 승인·폐기·재생성
- 생성 프리셋 관리

#### `tts-operations-console`

- TTS 작업과 항목 상태
- 실패 원인
- 일괄·개별 재시도
- 생성 음성 재생
- 게시 차단 상태 연결

#### `usage-cost-operations`

- AI·TTS 사용량과 예상 비용
- 실패와 게시 검토 대기 집계
- 실행 중 작업
- 서비스 설정과 비용 경고
- 관리자 홈 운영 카드와 빠른 진입

이 Wave는 이미 확정된 API를 소비하며 백엔드 상태 전이를 다시 설계하지
않는다.

### 5.8 Wave 7: 최종 통합 안정화

논리 작업명: `full-product-integration-hardening`

- 전체 목표 기능과 활성 API 대조
- OpenAPI 경로와 프론트엔드 소유 화면 대조
- 초기 콘텐츠와 운영 설정 migration
- 상태 조합과 게시 차단 검증
- 접근성, 모바일, 오류 복구
- 프로덕션 번들 분할과 성능
- 실제 공급자 설정과 최소 권한
- legacy HTTP 경로 비활성 확인
- 로컬 관리자·학습자 수동 테스트 환경
- 전체 품질 게이트

이 단계는 직렬로 수행한다.

## 6. 기능 브랜치 구현 순서

각 기능은 다음 순서로 구현한다.

1. 승인된 상위 설계와 제품 기획으로 기능 범위 고정
2. 공개 API 계약과 실패 테스트
3. 도메인 상태 전이와 port
4. DB schema·repository·query
5. Controller 또는 worker
6. 프론트엔드 Page·Feature
7. focused test와 workspace 검증
8. 최신 `main` rebase
9. 코드 리뷰
10. 통합 담당자의 root 조립과 migration
11. 전체 품질 게이트

Vitest와 Jest의 `describe`, `it`, `test` 설명은 한국어로 작성한다.
브라우저나 API E2E 테스트는 추가하지 않는다.

## 7. 계약과 DB 변경 규칙

### 7.1 공개 계약

- `shared/contracts/src/<기능>`의 Zod schema를 단일 원본으로 사용한다.
- 계약 테스트를 먼저 실패시킨다.
- 백엔드 응답과 프론트엔드 파싱이 같은 계약을 사용한다.
- Controller의 정상·오류·보안 Swagger metadata를 같은 기능에서
  완성한다.
- 활성 경로를 OpenAPI 문서 단위 테스트로 검증한다.
- 다른 병렬 브랜치가 미병합 계약을 참조하지 않는다.

### 7.2 DB

기능 브랜치는 기능 schema와 관련 테스트를 작성한다. 통합 담당자는
기능 하나를 병합한 직후 다음을 수행한다.

1. schema index 연결
2. 기능 하나만 포함한 migration 생성
3. snapshot과 journal 확인
4. 빈 DB 적용 검증
5. 기존 최신 DB upgrade 검증
6. transaction 테스트
7. 다음 기능 병합

여러 기능을 한 migration에 섞지 않는다. 운영 DB에 적용된 migration은
기존 파일을 수정하지 않고 forward migration으로 보정한다.

## 8. 비동기·동시성 검증

AI, OCR, TTS, 어휘 병합에는 최소한 다음 검증이 필요하다.

- 동일 요청 재실행의 멱등성
- 동시 중복 요청
- 일부 항목 실패와 나머지 계속 처리
- 재시도 한도와 terminal 상태
- 중간 실패 transaction rollback
- 오래된 결과의 최신 콘텐츠 덮어쓰기 차단
- 공급자 timeout과 잘못된 응답
- 사용량·비용 기록 중복 방지
- 외부 호출 뒤 저장 실패 시 안전한 재시도

테스트는 실제 외부 공급자 대신 fake adapter를 사용한다.

## 9. 품질 게이트

기능 브랜치는 최소한 다음을 통과한다.

```bash
pnpm structure:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @flex-thia/web architecture:check
```

프론트엔드를 변경하면 다음도 통과한다.

```bash
pnpm --filter @flex-thia/web test
pnpm --filter @flex-thia/web coverage
pnpm --filter @flex-thia/web build
```

통합 `main`에서는 `pnpm check` 전체를 새로 실행한다. 현재 Codex
실행환경에서 Steiger native watcher의 `EMFILE`이 재현되면 검증 명령에만
`CHOKIDAR_USEPOLLING=1`을 적용한다.

## 10. 병합 거부 조건

다음 변경은 병합하지 않는다.

- 소유 범위 밖의 관련 없는 코드
- 승인되지 않은 패키지나 환경 변수
- 공개 계약 대신 임시 타입
- 프론트엔드의 backend 내부 import
- Controller와 worker에 복제한 도메인 규칙
- 새 E2E runner·spec·설정
- 영어 테스트 설명
- 수동 수정한 route tree나 migration snapshot
- 원인이 설명되지 않은 새 빌드 경고
- 비결정적인 외부 공급자 실패 상태
- 기능 구현 없이 추가한 미래 추측성 추상화

## 11. 병합과 실패 복구

먼저 완료된 기능부터 병합한다. 한 기능을 병합하고 root 조립,
migration, 전체 검증을 완료한 뒤 남은 기능 브랜치를 최신 `main`으로
rebase한다.

- 공유 기준선을 `git reset --hard`로 되돌리지 않는다.
- 기능 병합과 조립은 독립적으로 revert 가능한 커밋으로 유지한다.
- migration 적용 전 실패하면 기능과 migration을 함께 되돌린다.
- production 적용 뒤에는 rollback migration 또는 forward fix를 별도
  설계한다.
- 실패한 기준을 나머지 브랜치에 전파하지 않는다.
- 같은 통합 실패에 세 번 실패하면 추가 수정 전에 구조를 재검토한다.

## 12. Worktree 운영

기본 저장소는 통합 전용으로 사용한다.

```text
/Users/limjaejoon/codding/flex-thia
```

동시 기능은 임시 worktree를 사용한다.

```text
/private/tmp/flex-thia-wave-<번호>-a
/private/tmp/flex-thia-wave-<번호>-b
/private/tmp/flex-thia-wave-<번호>-c
```

한 Wave의 실행 흐름은 다음과 같다.

1. 원격 `main` fetch와 기준 SHA 기록
2. 동일 SHA에서 worktree 생성
3. 기능별 명세, 허용 경로, 금지 파일, 검증 명령 전달
4. 독립 기능 동시 구현
5. 먼저 완료된 브랜치 검토
6. 기능 코드 병합
7. root export·조립·migration·route tree 반영
8. 전체 품질 게이트
9. 남은 브랜치 rebase
10. Wave 수용 조건 확인
11. worktree 정리
12. 다음 Wave 시작

## 13. 사용자 판단이 필요한 중단 조건

다음 경우에만 자동 진행을 중단한다.

- 전체 제품 기획과 활성 API가 충돌
- 외부 공급자나 유료 서비스 선택
- 새 패키지 설치
- 기존 데이터를 파괴할 수 있는 migration
- 기획에 없는 역할·상태·화면
- 세 번의 수정 뒤에도 같은 통합 실패
- 테스트와 문서만으로 올바른 동작을 결정할 수 없음

일반적인 테스트 실패, 타입 오류, 구현 버그와 병합 충돌은 원인을
조사하고 작업 범위 안에서 해결한다.

## 14. 최종 완료 조건

- 통합 제품 기획의 목표 기능에 소유 모듈과 사용자 화면이 있다.
- 모든 활성 API가 공개 계약과 OpenAPI 문서에 존재한다.
- 이메일 인증, 학습, 관리자 생성·검증·TTS·게시 흐름이 연결된다.
- 관리자와 학습자 local seed 계정으로 주요 동작을 확인할 수 있다.
- local fake를 사용하면 유료 공급자 없이 전체 흐름을 시험할 수 있다.
- production 설정은 실제 공급자와 최소 권한을 사용한다.
- migration이 빈 DB와 기존 DB에서 검증된다.
- 구조, 포맷, lint, architecture, typecheck, test, coverage, build가
  통과한다.
- E2E artifact, dark mode, 추측성 계층과 관련 없는 리팩터링이 없다.
- 모든 기능이 최신 `main`에 통합되고 작업 트리가 깨끗하다.

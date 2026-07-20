# CI esbuild Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 깨끗한 GitHub Actions 설치에서도 CDK Lambda 번들링과 인프라 테스트가 안정적으로 실행되게 한다.

**Architecture:** CDK 번들링 설정은 유지하고, 명령이 실행되는 루트 workspace에 `esbuild`를 직접 선언한다. 루트 Vitest/Vite의 peer 범위와 호환되는 버전을 사용하며 테스트 파일은 직렬 실행해 CDK 번들링의 CPU 경합을 제거한다.

**Tech Stack:** pnpm 10.33.0, esbuild 0.28.x, AWS CDK, Vitest

## Global Constraints

- 루트 `devDependencies`에 `esbuild` `^0.28.0`만 추가한다.
- CDK 구성과 개별 테스트 파일은 변경하지 않는다.
- 공통 Vitest 설정에서 테스트 파일 병렬 실행만 비활성화한다.
- 검증은 깨끗한 worktree와 전체 프로젝트 검사로 수행한다.

---

### Task 1: 루트 esbuild 실행 보장

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: 깨끗한 worktree의 루트 명령과 기존 전체 검사

**Interfaces:**
- Consumes: CDK `NodejsFunction`이 루트에서 실행하는 `pnpm exec esbuild`
- Produces: 루트 workspace의 `esbuild` 0.28.x 실행 파일

- [x] **Step 1: 수정 전 실패를 확인한다**

Run: `pnpm exec esbuild --version`

Expected: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "esbuild" not found`

- [x] **Step 2: 루트 개발 의존성을 최소 변경한다**

`package.json`의 `devDependencies`에 다음 항목을 추가한다.

```json
"esbuild": "^0.28.0"
```

- [x] **Step 3: lockfile을 갱신한다**

Run: `pnpm install --lockfile-only`

Expected: 루트 importer에 `esbuild` `^0.28.0`과 해석된 0.28.x 버전이 기록된다.

- [x] **Step 4: 깨끗한 설치 계약을 확인한다**

Run: `pnpm install --frozen-lockfile`

Expected: lockfile 변경 없이 의존성 설치가 완료된다.

- [x] **Step 5: 수정 후 루트 실행을 확인한다**

Run: `pnpm exec esbuild --version`

Expected: `0.28.1`

- [x] **Step 6: 전체 코드와 인프라 설계도를 검증한다**

Run: `pnpm check`

Expected: 테스트 파일 45개와 테스트 84개가 모두 통과하고 빌드가 성공한다.

Run: `pnpm infra:synth`

Expected: `FlexThiaDataProd`, `FlexThiaApplicationProd`, `FlexThiaEdgeProd` 설계도가 성공적으로 생성된다.

- [x] **Step 7: 변경을 커밋한다**

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix: expose esbuild to CDK bundling"
```

### Task 2: CDK 테스트 병렬 번들링 경합 제거

**Files:**
- Modify: `vitest.config.ts`
- Test: 기존 전체 검사

**Interfaces:**
- Consumes: Vitest의 테스트 파일 실행 스케줄러
- Produces: 한 번에 하나의 테스트 파일만 실행하는 안정적인 CDK 번들링 환경

- [x] **Step 1: 병렬 실행의 시간 초과를 확인한다**

Run: `pnpm check`

Expected: 여러 CDK 인프라 테스트가 기본 5초 제한을 넘어 실패한다.

- [x] **Step 2: 단일 worker로 원인 가설을 검증한다**

Run: `pnpm exec vitest run infra/test --maxWorkers=1`

Expected: 인프라 테스트 파일 8개와 테스트 28개가 모두 통과한다.

- [x] **Step 3: 테스트 파일을 직렬 실행한다**

`vitest.config.ts`의 `test` 설정에 다음 값을 추가한다.

```ts
// CDK 테스트의 동시 Lambda 번들링이 5초 제한을 넘기지 않게 파일을 직렬 실행
fileParallelism: false,
```

- [x] **Step 4: 전체 코드와 인프라 설계도를 다시 검증한다**

Run: `pnpm check`

Expected: 테스트 파일 45개와 테스트 84개가 모두 통과하고 빌드가 성공한다.

Run: `pnpm infra:synth`

Expected: 세 production stack 설계도가 성공적으로 생성된다.

- [x] **Step 5: 변경을 커밋한다**

```bash
git add vitest.config.ts docs/superpowers/specs/2026-07-19-ci-esbuild-availability-design.md docs/superpowers/plans/2026-07-20-ci-esbuild-availability.md
git commit -m "test: serialize CDK bundling specs"
```

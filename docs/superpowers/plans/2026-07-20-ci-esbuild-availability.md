# CI esbuild Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 깨끗한 GitHub Actions 설치에서도 CDK Lambda 번들링이 루트 `esbuild`를 찾게 한다.

**Architecture:** CDK 번들링 설정은 유지하고, 명령이 실행되는 루트 workspace에 `esbuild`를 직접 선언한다. 루트 Vitest/Vite의 peer 범위와 호환되는 버전을 사용하고 하위 workspace는 변경하지 않는다.

**Tech Stack:** pnpm 10.33.0, esbuild 0.28.x, AWS CDK, Vitest

## Global Constraints

- 루트 `devDependencies`에 `esbuild` `^0.28.0`만 추가한다.
- CDK 구성과 테스트 파일은 변경하지 않는다.
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

- [ ] **Step 1: 수정 전 실패를 확인한다**

Run: `pnpm exec esbuild --version`

Expected: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "esbuild" not found`

- [ ] **Step 2: 루트 개발 의존성을 최소 변경한다**

`package.json`의 `devDependencies`에 다음 항목을 추가한다.

```json
"esbuild": "^0.28.0"
```

- [ ] **Step 3: lockfile을 갱신한다**

Run: `pnpm install --lockfile-only`

Expected: 루트 importer에 `esbuild` `^0.28.0`과 해석된 0.28.x 버전이 기록된다.

- [ ] **Step 4: 깨끗한 설치 계약을 확인한다**

Run: `pnpm install --frozen-lockfile`

Expected: lockfile 변경 없이 의존성 설치가 완료된다.

- [ ] **Step 5: 수정 후 루트 실행을 확인한다**

Run: `pnpm exec esbuild --version`

Expected: `0.28.1`

- [ ] **Step 6: 전체 코드와 인프라 설계도를 검증한다**

Run: `pnpm check`

Expected: 테스트 파일 45개와 테스트 84개가 모두 통과하고 빌드가 성공한다.

Run: `pnpm infra:synth`

Expected: `FlexThiaDataProd`, `FlexThiaApplicationProd`, `FlexThiaEdgeProd` 설계도가 성공적으로 생성된다.

- [ ] **Step 7: 변경을 커밋한다**

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix: expose esbuild to CDK bundling"
```

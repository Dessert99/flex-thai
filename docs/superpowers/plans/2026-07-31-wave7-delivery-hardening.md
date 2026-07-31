# Wave 7 Delivery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** production이 실제 Vite application을 안전한 CloudFront 설정으로
배포하고, web bundle·Docker context·Nest logger의 확인된 전달 위험을
제거한다.

**Architecture:** EdgeStack은 web asset path를 필수 dependency로 받고
fixture synth와 production dist를 호출자가 명시한다. Production workflow는
API subdomain으로 Vite를 build한 뒤 실행 가능한 artifact verifier를
통과한 같은 dist만 CDK에 전달한다.

**Tech Stack:** AWS CDK, CloudFront, S3 Deployment, Vite, TanStack Router,
Node.js, NestJS, Vitest, GitHub Actions

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-31-wave7-full-product-hardening-design.md`다.
- 외부 provider, 새 package, E2E와 실제 AWS deploy를 추가하지 않는다.
- production은 probe HTML로 fallback하지 않고 dist 누락 시 fail-fast한다.
- `VITE_API_BASE_URL`은 `https://api.${ROOT_DOMAIN}/api/v1`이다.
- bundle warning threshold를 올리거나 warning을 숨기지 않는다.
- `routeTree.gen.ts`는 통합 branch에서만 생성한다.
- compose/local provider/contracts/product page는 수정하지 않는다.
- secret의 내용, PEM bytes, token, cookie, authorization을 출력하지 않는다.
- 새 코드와 변경 코드는 comment/structure convention을 따른다.
- 테스트 설명은 한국어로 작성하고 production code보다 RED test를 먼저 작성한다.
- config/prose는 source text grep으로 테스트하지 않고 실행 결과를 검증한다.
- 수동 수정은 `apply_patch`로 하고 정확한 build artifact만 정리한다.

---

### Task 1: EdgeStack 실제 web asset과 security headers

**Files:**

- Modify: `infra/src/edge-stack.ts`
- Modify: `infra/src/app.ts`
- Modify: `infra/test/edge-stack.spec.ts`

**Interfaces:**

- Produces:

```ts
export interface EdgeStackProps extends StackProps {
  config: InfrastructureConfig;
  dataStack: DataStack;
  webAssetPath: string;
}
```

- Consumes: fixture synth의 `infra/assets/web`, production의
  `frontend/web/dist`

- [ ] **Step 1: asset injection RED tests 작성**

temporary fixture directory로 stack을 만들고 synthesized
`Custom::CDKBucketDeployment`가 prune과 `['/index.html', '/assets/*']`
invalidation을 갖는지 검증한다. 없는 directory는 constructor에서 stable
configuration error로 실패해야 한다.

- [ ] **Step 2: response policy RED tests 작성**

default와 `assets/*` behavior의 `ResponseHeadersPolicyId`가 같은 custom
policy를 참조하고 다음 literal policy를 확인한다.

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

CSP `connect-src`는 self와 `https://api.<rootDomain>`만 포함한다.

- [ ] **Step 3: RED 확인**

Run:

```bash
pnpm exec vitest run infra/test/edge-stack.spec.ts
```

Expected: `webAssetPath`와 response policy가 없어 FAIL.

- [ ] **Step 4: fail-fast asset와 BucketDeployment 구현**

`DeployProbe`를 production 의미의 이름으로 바꾸고
`Source.asset(props.webAssetPath)`만 사용한다. directory 존재/type을
검증하되 contents를 runtime source로 읽어 복제하지 않는다.

- [ ] **Step 5: app fixture/production path 조립**

`synthFixture=true`일 때만 tracked fixture를 주입하고 일반 app 실행은
repo root의 `frontend/web/dist`를 주입한다. production dist가 없으면
fixture로 대체하지 않는다.

- [ ] **Step 6: GREEN, synth와 commit**

Run:

```bash
pnpm exec vitest run infra/test/edge-stack.spec.ts
pnpm infra:test
pnpm infra:synth
```

Commit:

```text
feat(infra): deploy explicit web artifacts
```

### Task 2: Router route code splitting과 clean build

**Files:**

- Modify: `frontend/web/vite.config.ts`
- Move: `frontend/web/src/app/routes/_authenticated._learner.questions.test.ts`
  to `frontend/web/src/app/routes/-_authenticated._learner.questions.test.ts`
- Create: `scripts/verify-production-web-artifact.mjs`
- Create: `scripts/verify-production-web-artifact.spec.mjs`

**Interfaces:**

- Produces: route-level async chunks와 실행 가능한 production artifact verifier
- Consumes: `VITE_API_BASE_URL`, built `frontend/web/dist`

- [ ] **Step 1: verifier RED behavior tests 작성**

temporary artifact fixture를 사용해 다음을 각각 검증한다.

```js
await expect(
  verifyProductionWebArtifact({
    directory,
    apiBaseUrl: 'https://api.example.com/api/v1',
    maximumJavaScriptBytes: 500_000,
  }),
).resolves.toMatchObject({ indexFile: 'index.html' });
```

probe 문구, API URL 누락, 500,000 bytes 초과 application JS, missing
index/assets는 stable error로 실패해야 한다. source YAML/TS 문구를 grep하지
않는다.

- [ ] **Step 2: 현재 build RED evidence 기록**

Run:

```bash
pnpm --filter @flex-thia/web build
```

Expected before implementation: route test scan warning과 500KB 초과 warning.

- [ ] **Step 3: minimal splitting/rename 구현**

TanStack Router plugin option에 `autoCodeSplitting: true`를 추가하고 test
file은 default ignore prefix `-`를 사용한다. `chunkSizeWarningLimit`는
변경하지 않는다.

- [ ] **Step 4: verifier 구현과 GREEN**

Run:

```bash
pnpm exec vitest run scripts/verify-production-web-artifact.spec.mjs
VITE_API_BASE_URL=https://api.example.com/api/v1 pnpm --filter @flex-thia/web build
node scripts/verify-production-web-artifact.mjs frontend/web/dist https://api.example.com/api/v1
```

Expected: route scan/chunk warning 없음, verifier PASS.

- [ ] **Step 5: route regression과 commit**

Run moved route test, full web test/typecheck/build. Commit:

```text
perf(web): split application routes
```

### Task 3: Production workflow artifact build와 배포 문서

**Files:**

- Create: `scripts/build-production-web.mjs`
- Create: `scripts/build-production-web.spec.mjs`
- Modify: `.github/workflows/deploy-production.yml`
- Modify: `docs/development/aws-deployment.md`

**Interfaces:**

- Produces: `node scripts/build-production-web.mjs <root-domain>`
- Consumes: Task 2 verifier와 `ROOT_DOMAIN`

- [ ] **Step 1: build runner RED tests 작성**

child process runner를 주입해 root domain validation, exact env와 command,
warning output failure, verifier 호출 순서를 행동으로 검증한다.

```js
expect(invocation).toMatchObject({
  command: 'pnpm',
  args: ['--filter', '@flex-thia/web', 'build'],
  env: {
    VITE_API_BASE_URL: 'https://api.example.com/api/v1',
  },
});
```

invalid domain, nonzero build exit, route scan warning, 500KB warning은
실패해야 한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm exec vitest run scripts/build-production-web.spec.mjs
```

Expected: runner가 없어 FAIL.

- [ ] **Step 3: build runner 구현**

stdout/stderr를 capture하되 secret 환경을 출력하지 않는다. build 성공 후
Task 2 verifier를 호출한다.

- [ ] **Step 4: workflow 연결**

`pnpm check` 뒤 AWS credential 획득 전에 production build runner를
실행한다. 이후 CDK diff/deploy는 같은 workspace의 dist를 사용한다.
별도 `pnpm check`나 default web build가 production artifact 뒤에서
dist를 덮어쓰지 않게 순서를 고정한다.

- [ ] **Step 5: 배포 문서 갱신**

probe가 정상이라는 stale 설명을 제거하고 실제 Vite artifact, API
subdomain, build verifier, 배포 후 web/API 확인과 rollback 절차를
기록한다. 유료 AI·TTS provider는 미구성 fail-closed임을 명시한다.

- [ ] **Step 6: GREEN과 commit**

Run runner tests, production example build/verifier, `pnpm infra:synth`.
Commit:

```text
ci(production): build verified web artifacts
```

### Task 4: Docker build context secret·cache 배제

**Files:**

- Modify: `.dockerignore`

**Interfaces:**

- Produces: Docker build context exclusion for `*.pem`, `.worktrees`,
  `.pnpm-store`, `coverage`, `**/coverage`
- Consumes: existing `Dockerfile.local`의 `COPY . .`

- [ ] **Step 1: 현재 context 위험을 basename으로만 확인**

Run:

```bash
git check-ignore media-private-key.pem
docker buildx build --file Dockerfile.local --target workspace --progress=plain --no-cache --load --tag flex-thia-context-audit:local .
```

Expected before fix: ignored PEM이 build context 대상이 될 수 있음. PEM
내용이나 hash를 출력하지 않는다.

- [ ] **Step 2: exact ignore boundary 구현**

기존 ignore를 보존하고 다음을 추가한다.

```text
*.pem
.worktrees
.pnpm-store
coverage
**/coverage
```

- [ ] **Step 3: actual image/context behavior 검증**

같은 workspace image를 rebuild하고 container filesystem에서
`media-private-key.pem` basename과 `.worktrees`, coverage가 없음을
확인한다. 검증 container만 제거하고 application container/volume은
건드리지 않는다.

- [ ] **Step 4: commit**

Commit:

```text
security(docker): exclude local secrets and caches
```

### Task 5: Nest-compatible safe StructuredLogger

**Files:**

- Modify: `backend/api/src/common/logging/structured-logger.ts`
- Modify: `backend/api/src/common/logging/structured-logger.spec.ts`

**Interfaces:**

- Implements: Nest `LoggerService`의 variadic optional parameters
- Produces: plain metadata merge, safe context와 Error name projection

- [ ] **Step 1: variadic/redaction RED tests 작성**

다음 호출에서 numeric character keys가 생기지 않고 context와 requestId만
남는지 검증한다.

```ts
logger.log('ready', 'NestContext', { requestId: 'request-1' });
```

`error('failed', rawStack, 'NestContext', new Error('password=secret'))`는
raw stack, Error message, password/token/cookie/authorization/secret 값을
출력하지 않는다. 배열·Date·Error는 plain metadata로 spread하지 않는다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm exec vitest run backend/api/src/common/logging/structured-logger.spec.ts
```

Expected: 문자열 optional parameter가 metadata처럼 펼쳐져 FAIL.

- [ ] **Step 3: minimal normalization 구현**

public methods는 `message: unknown, ...optionalParams: unknown[]`을 받고
plain record만 metadata로 merge한다. 마지막 문자열은 context로
projection하고 Error는 name만 남긴다. raw stack과 Error message는
버린다. `level`, `service`, `message`는 metadata가 덮어쓸 수 없다.

- [ ] **Step 4: GREEN과 mutation 확인**

Run focused test와 API typecheck. `isPlainRecord` guard를 무력화하면
variadic test가 RED가 되는지 확인한 뒤 복원한다.

- [ ] **Step 5: branch verification과 commit**

Run:

```bash
pnpm exec vitest run infra/test/edge-stack.spec.ts scripts/verify-production-web-artifact.spec.mjs scripts/build-production-web.spec.mjs backend/api/src/common/logging/structured-logger.spec.ts
pnpm --filter @flex-thia/web test
pnpm --filter @flex-thia/web typecheck
pnpm --filter @flex-thia/api typecheck
pnpm infra:test
pnpm infra:synth
VITE_API_BASE_URL=https://api.example.com/api/v1 pnpm --filter @flex-thia/web build
node scripts/verify-production-web-artifact.mjs frontend/web/dist https://api.example.com/api/v1
```

Commit:

```text
fix(logging): normalize Nest optional parameters
```

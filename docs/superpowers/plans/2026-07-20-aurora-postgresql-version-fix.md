# Aurora PostgreSQL Version Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서울 리전에서 생성할 수 없는 Aurora PostgreSQL 16.3을 16.13으로 바꿔 운영 DataStack 배포 실패를 제거한다.

**Architecture:** 기존 DataStack 구조와 Serverless v2 설정은 유지하고 엔진 minor version만 명시적으로 교체한다. 합성된 CloudFormation template의 `EngineVersion`을 단위 테스트로 고정해 같은 리전 호환성 문제가 코드 검토 없이 재발하지 않게 한다.

**Tech Stack:** TypeScript, AWS CDK v2, Aurora PostgreSQL Serverless v2, Vitest

## Global Constraints

- Aurora PostgreSQL engine version은 서울 리전에서 제공되는 `16.13`으로 고정한다.
- Serverless v2 용량 `0-2` ACU, 15분 auto-pause, Data API, 보존 정책은 변경하지 않는다.
- 운영 코드는 엔진 버전 한 줄만 변경하고 관련 없는 리팩터링을 하지 않는다.
- 브라우저·API 통합 E2E 테스트는 추가하지 않는다.

---

### Task 1: DataStack Aurora engine version 교체

**Files:**
- Modify: `infra/test/data-stack.spec.ts`
- Modify: `infra/src/data-stack.ts`

**Interfaces:**
- Consumes: `rds.AuroraPostgresEngineVersion.VER_16_13`
- Produces: `AWS::RDS::DBCluster`의 `EngineVersion: '16.13'`

- [ ] **Step 1: 엔진 버전 회귀 테스트 작성**

`infra/test/data-stack.spec.ts`의 첫 번째 `AWS::RDS::DBCluster` assertion에
다음 속성을 추가한다.

```ts
template.hasResourceProperties('AWS::RDS::DBCluster', {
  Engine: 'aurora-postgresql',
  EngineVersion: '16.13',
  EnableHttpEndpoint: true,
  DeletionProtection: true,
  ServerlessV2ScalingConfiguration: {
    MinCapacity: 0,
    MaxCapacity: 2,
    SecondsUntilAutoPause: 900,
  },
});
```

- [ ] **Step 2: 회귀 테스트가 현재 16.3을 검출하는지 확인**

Run:

```bash
pnpm exec vitest run infra/test/data-stack.spec.ts
```

Expected: FAIL. 합성된 DB cluster의 `EngineVersion`이 `16.3`이라
`EngineVersion: '16.13'` assertion을 만족하지 못한다.

- [ ] **Step 3: 운영 엔진 버전을 16.13으로 변경**

`infra/src/data-stack.ts`에서 다음 한 줄만 변경한다.

```ts
version: rds.AuroraPostgresEngineVersion.VER_16_13,
```

- [ ] **Step 4: 회귀 테스트 통과 확인**

Run:

```bash
pnpm exec vitest run infra/test/data-stack.spec.ts
```

Expected: PASS. `infra/test/data-stack.spec.ts`의 모든 테스트가 통과한다.

- [ ] **Step 5: infra 정적 검사와 CloudFormation 합성 확인**

Run:

```bash
pnpm --filter @flex-thia/infra typecheck
pnpm infra:synth
pnpm exec prettier --check infra/src/data-stack.ts infra/test/data-stack.spec.ts
git diff --check
```

Expected: 모든 명령이 exit code 0으로 끝나고 합성된
`FlexThiaDataProd` DB cluster가 `EngineVersion: '16.13'`을 사용한다.

- [ ] **Step 6: 구현 커밋**

```bash
git add infra/src/data-stack.ts infra/test/data-stack.spec.ts
git commit -m "fix: use supported aurora postgres version"
```

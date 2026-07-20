# Aurora Data API Migration Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 0 ACU에서 재개 중인 Aurora 때문에 운영 migration이 즉시 실패하지 않도록, 확인 가능한 Data API 준비 대기를 migration 앞에 추가한다.

**Architecture:** database package에 순수한 재시도 정책과 RDS Data API `select 1` command를 분리한다. GitHub Actions는 DataStack output을 환경 변수로 만든 직후 준비 command를 실행하고, 준비 확인에 성공한 경우에만 기존 Drizzle migration을 실행한다.

**Tech Stack:** TypeScript, Vitest, AWS SDK v3 RDS Data API, pnpm, GitHub Actions

## Global Constraints

- `DatabaseResumingException`만 재시도하고 다른 오류는 첫 실패에서 그대로 반환한다.
- probe는 최대 20회 실행하고 재시도 사이에는 5초를 기다린다.
- probe SQL은 부수효과 없는 `select 1`만 사용한다.
- 실제 migration은 production workflow에서만 실행한다.
- 새 TypeScript 파일과 export는 `conventions/comment-convention.md`의 한 줄 한국어 JSDoc을 따른다.
- Vitest의 `describe`, `it`, `test` 설명 문자열은 한국어로 작성한다.
- E2E 테스트를 추가하지 않는다.

---

### Task 1: Data API 재개 대기 정책

**Files:**
- Create: `packages/database/src/operations/wait-for-data-api.spec.ts`
- Create: `packages/database/src/operations/wait-for-data-api.ts`

**Interfaces:**
- Consumes: AWS SDK의 `DatabaseResumingException`
- Produces: `WaitForDataApiOptions`, `waitForDataApi(options): Promise<void>`

- [ ] **Step 1: 재개 오류 뒤 성공하는 실패 테스트 작성**

```ts
/** Aurora 재개 중 오류에만 제한적으로 재시도하는 정책을 검증한다 */
import { DatabaseResumingException } from '@aws-sdk/client-rds-data';
import { describe, expect, it } from 'vitest';

import { waitForDataApi } from './wait-for-data-api.js';

const createResumingError = (): DatabaseResumingException =>
  new DatabaseResumingException({
    $metadata: {},
    message: 'Aurora가 재개 중입니다.',
  });

describe('waitForDataApi', () => {
  it('Aurora 재개 오류 뒤 probe가 성공하면 대기를 끝낸다', async () => {
    let probeCount = 0;
    let sleepCount = 0;
    const retries: number[] = [];

    await waitForDataApi({
      maxAttempts: 3,
      probe: async () => {
        probeCount += 1;
        if (probeCount === 1) throw createResumingError();
      },
      sleep: async () => {
        sleepCount += 1;
      },
      onRetry: (attempt) => {
        retries.push(attempt);
      },
    });

    expect(probeCount).toBe(2);
    expect(sleepCount).toBe(1);
    expect(retries).toEqual([1]);
  });
});
```

- [ ] **Step 2: 테스트가 구현 파일 부재로 실패하는지 확인**

Run: `pnpm exec vitest run packages/database/src/operations/wait-for-data-api.spec.ts`

Expected: FAIL because `./wait-for-data-api.js` cannot be resolved.

- [ ] **Step 3: 재개 오류만 다시 시도하는 최소 구현 작성**

```ts
/** Aurora Data API의 일시적인 재개 상태만 제한적으로 기다린다 */
import { DatabaseResumingException } from '@aws-sdk/client-rds-data';

/** Data API 준비 확인에 필요한 실행 동작을 주입해 재시도 정책을 격리한다 */
export interface WaitForDataApiOptions {
  maxAttempts: number;
  probe: () => Promise<void>;
  sleep: () => Promise<void>;
  onRetry: (attempt: number) => void;
}

/** 재개 중이면 기다리고 그 밖의 오류는 즉시 반환한다 */
export const waitForDataApi = async ({
  maxAttempts,
  probe,
  sleep,
  onRetry,
}: WaitForDataApiOptions): Promise<void> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await probe();
      return;
    } catch (error) {
      if (
        !(error instanceof DatabaseResumingException) ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      onRetry(attempt);
      await sleep();
    }
  }
};
```

- [ ] **Step 4: 첫 테스트가 통과하는지 확인**

Run: `pnpm exec vitest run packages/database/src/operations/wait-for-data-api.spec.ts`

Expected: PASS, 1 test passed.

- [ ] **Step 5: 비일시 오류와 최대 시도 초과 실패 테스트 추가**

```ts
it('재개 오류가 아니면 기다리지 않고 첫 오류를 반환한다', async () => {
  const accessError = new Error('권한이 없습니다.');
  let probeCount = 0;
  let sleepCount = 0;

  const result = waitForDataApi({
    maxAttempts: 3,
    probe: async () => {
      probeCount += 1;
      throw accessError;
    },
    sleep: async () => {
      sleepCount += 1;
    },
    onRetry: () => undefined,
  });

  await expect(result).rejects.toBe(accessError);
  expect(probeCount).toBe(1);
  expect(sleepCount).toBe(0);
});

it('최대 횟수까지 재개 중이면 마지막 오류를 반환한다', async () => {
  const errors = [createResumingError(), createResumingError()];
  let probeCount = 0;
  let sleepCount = 0;

  const result = waitForDataApi({
    maxAttempts: 2,
    probe: async () => {
      const error = errors[probeCount];
      probeCount += 1;
      throw error;
    },
    sleep: async () => {
      sleepCount += 1;
    },
    onRetry: () => undefined,
  });

  await expect(result).rejects.toBe(errors[1]);
  expect(probeCount).toBe(2);
  expect(sleepCount).toBe(1);
});
```

- [ ] **Step 6: 세 정책 테스트가 모두 통과하는지 확인**

Run: `pnpm exec vitest run packages/database/src/operations/wait-for-data-api.spec.ts`

Expected: PASS, 3 tests passed.

### Task 2: 운영 준비 command와 workflow 연결

**Files:**
- Create: `packages/database/src/commands/wait-for-data-api.ts`
- Modify: `packages/database/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/deploy-production.yml`

**Interfaces:**
- Consumes: `waitForDataApi(options): Promise<void>`, `RDS_RESOURCE_ARN`, `RDS_SECRET_ARN`, `DATABASE_NAME`, `AWS_REGION`
- Produces: `pnpm --filter @flex-thia/database db:wait:data-api`

- [ ] **Step 1: Data API `select 1` command 작성**

```ts
/** 운영 migration 전에 0 ACU Aurora가 Data API 요청을 받을 때까지 기다린다 */
import {
  ExecuteStatementCommand,
  RDSDataClient,
} from '@aws-sdk/client-rds-data';

import { waitForDataApi } from '../operations/wait-for-data-api.js';

const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 5_000;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const resourceArn = requireEnv('RDS_RESOURCE_ARN');
const secretArn = requireEnv('RDS_SECRET_ARN');
const database = requireEnv('DATABASE_NAME');
const region = requireEnv('AWS_REGION');
const client = new RDSDataClient({ region });

await waitForDataApi({
  maxAttempts: MAX_ATTEMPTS,
  probe: async () => {
    await client.send(
      new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: 'select 1',
      }),
    );
  },
  sleep: () =>
    new Promise((resolve) => {
      setTimeout(resolve, RETRY_DELAY_MS);
    }),
  onRetry: (attempt) => {
    console.info(
      `Aurora Data API 재개 대기 중 (${attempt}/${MAX_ATTEMPTS})`,
    );
  },
});

console.info('Aurora Data API 준비 완료');
```

- [ ] **Step 2: package command와 실행 의존성 추가**

`packages/database/package.json`의 scripts에 다음 command를 추가한다.

```json
"db:wait:data-api": "tsx src/commands/wait-for-data-api.ts"
```

`packages/database/package.json`의 devDependencies에 다음 의존성을 추가한다.

```json
"tsx": "^4.20.0"
```

Run: `pnpm install --lockfile-only`

Expected: exit 0 and the database importer in `pnpm-lock.yaml` contains `tsx`.

- [ ] **Step 3: migration 앞에 준비 단계 연결**

`.github/workflows/deploy-production.yml`에서 `데이터베이스 migration 설정 읽기` 다음에 아래 단계를 추가한다.

```yaml
      - name: Aurora Data API 준비 대기
        run: pnpm --filter @flex-thia/database db:wait:data-api
```

- [ ] **Step 4: database 범위 검증**

Run: `pnpm exec vitest run packages/database/src/operations/wait-for-data-api.spec.ts`

Expected: PASS, 3 tests passed.

Run: `pnpm --filter @flex-thia/database typecheck`

Expected: exit 0 with no TypeScript errors.

### Task 3: 저장소 전체 검증과 AWS 사전 점검

**Files:**
- Verify only: repository and AWS production resources

**Interfaces:**
- Consumes: local AWS profile `flex-thia-admin`, production CDK context values
- Produces: code quality evidence, synth evidence, non-destructive diff evidence, live Data API readiness evidence

- [ ] **Step 1: 저장소 전체 검증**

Run: `pnpm check`

Expected: exit 0; formatting, lint, typecheck, tests, build all pass.

Run: `pnpm infra:synth`

Expected: exit 0 and production stacks synthesize.

- [ ] **Step 2: 실제 Aurora 준비 command만 읽기 전용으로 확인**

DataStack output의 cluster ARN과 secret ARN을 환경 변수로 전달하고 다음을 실행한다.

Run:

```bash
export RDS_RESOURCE_ARN="$(aws --profile flex-thia-admin --region ap-northeast-2 cloudformation describe-stacks --stack-name FlexThiaDataProd --query "Stacks[0].Outputs[?OutputKey=='ClusterArn'].OutputValue" --output text)"
export RDS_SECRET_ARN="$(aws --profile flex-thia-admin --region ap-northeast-2 cloudformation describe-stacks --stack-name FlexThiaDataProd --query "Stacks[0].Outputs[?OutputKey=='SecretArn'].OutputValue" --output text)"
AWS_PROFILE=flex-thia-admin AWS_REGION=ap-northeast-2 DATABASE_NAME=flex_thia pnpm --filter @flex-thia/database db:wait:data-api
```

Expected: `Aurora Data API 준비 완료`; migration SQL은 실행되지 않는다.

- [ ] **Step 3: AWS 기반 자원과 DNS 확인**

Run: `aws --profile flex-thia-admin --region ap-northeast-2 cloudformation describe-stacks --stack-name CDKToolkit`

Expected: 서울 bootstrap stack is available.

Run: `aws --profile flex-thia-admin --region us-east-1 cloudformation describe-stacks --stack-name CDKToolkit`

Expected: 버지니아 bootstrap stack is available.

Run: `aws --profile flex-thia-admin route53 get-hosted-zone --id "$(gh variable get HOSTED_ZONE_ID --env production)"`

Expected: hosted zone name matches the production root domain.

Run: `aws --profile flex-thia-admin --region ap-northeast-2 cloudformation describe-stacks --stack-name FlexThiaDataProd`

Expected: `CREATE_COMPLETE`.

- [ ] **Step 4: CDK 변경 안전성 확인**

Run:

```bash
export CDK_ACCOUNT="$(gh variable get AWS_ACCOUNT_ID --env production)"
export ROOT_DOMAIN="$(gh variable get ROOT_DOMAIN --env production)"
export HOSTED_ZONE_ID="$(gh variable get HOSTED_ZONE_ID --env production)"
export ALERT_EMAIL="$(gh variable get ALERT_EMAIL --env production)"
export ALLOWED_EMAIL_DOMAINS="$(gh variable get ALLOWED_EMAIL_DOMAINS --env production)"
export MONTHLY_BUDGET_USD="$(gh variable get MONTHLY_BUDGET_USD --env production)"
export MEDIA_PUBLIC_KEY_PEM="$(gh variable get MEDIA_PUBLIC_KEY_PEM --env production)"
export GITHUB_REPOSITORY_CONTEXT="Dessert99/flex-thai"
AWS_PROFILE=flex-thia-admin pnpm --filter @flex-thia/infra exec cdk diff -c "account=$CDK_ACCOUNT" -c "rootDomain=$ROOT_DOMAIN" -c "hostedZoneId=$HOSTED_ZONE_ID" -c "alertEmail=$ALERT_EMAIL" -c "githubRepository=$GITHUB_REPOSITORY_CONTEXT" -c "allowedEmailDomains=$ALLOWED_EMAIL_DOMAINS" -c "monthlyBudgetUsd=$MONTHLY_BUDGET_USD"
```

Expected: no unexpected replacement or deletion.

### Task 4: 변경 커밋·푸시와 운영 배포 추적

**Files:**
- Commit: Task 1–2 implementation files
- Remote workflow: GitHub Actions `check.yml`, `deploy-production.yml`

**Interfaces:**
- Consumes: verified local commit, GitHub production environment approval
- Produces: successful CI and production deployment, or exact failing step and error report

- [ ] **Step 1: 변경 범위 검토 후 커밋**

Run: `git diff --check && git status --short && git diff --stat`

Expected: whitespace errors are absent and only planned files changed.

Run: `git add packages/database/src/operations/wait-for-data-api.spec.ts packages/database/src/operations/wait-for-data-api.ts packages/database/src/commands/wait-for-data-api.ts packages/database/package.json pnpm-lock.yaml .github/workflows/deploy-production.yml`

Run: `git commit -m "fix: wait for aurora before migration"`

Expected: commit succeeds.

- [ ] **Step 2: 최신 main을 원격에 푸시하고 CI 추적**

Run: `git push origin main`

Expected: push succeeds and the new `check` workflow completes successfully.

- [ ] **Step 3: production workflow 실행·승인**

Run: `gh workflow run deploy-production.yml --ref main`

Expected: a new `deploy-production` run enters the production review wait.

Approve the `production` environment deployment for that run.

Expected: deploy job starts.

- [ ] **Step 4: 완료까지 추적**

Run:

```bash
RUN_ID="$(gh run list --workflow deploy-production.yml --branch main --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$RUN_ID" --exit-status
```

Expected: Data stack, Data API readiness, migration, Application stack, Edge stack all complete. If any step fails, stop and report the exact step and logs before making another code or infrastructure change.

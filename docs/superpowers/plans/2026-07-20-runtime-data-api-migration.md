# Runtime Data API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** production migration이 Drizzle Kit의 구버전 번들 SDK를 우회하고 프로젝트의 현재 AWS SDK와 Drizzle runtime migrator만 사용하게 한다.

**Architecture:** package script는 새 TypeScript command를 호출한다. command는 현재 `RDSDataClient`와 Drizzle database를 만들고, 테스트 가능한 실행 경계가 runtime `migrate()`·오류 로그·client 정리를 관리한다.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM 0.45.2, AWS SDK RDS Data API 3.1089.0, pnpm

## Global Constraints

- production에서는 `drizzle-kit migrate`를 호출하지 않는다.
- package script 이름 `db:migrate:data-api`와 GitHub workflow 호출은 유지한다.
- query logger는 SQL만 기록하고 parameter 값은 기록하지 않는다.
- 실패 시 원본 오류를 기록하고 `process.exitCode = 1`로 종료한다.
- 성공·실패와 관계없이 `RDSDataClient.destroy()`를 호출한다.
- CLI 전용 `drizzle.data-api.config.ts`는 제거한다.
- 새 TypeScript 파일과 export는 한 줄 한국어 JSDoc을 사용한다.
- 테스트 설명 문자열은 한국어로 작성한다.

---

### Task 1: Production runtime command 회귀 테스트

**Files:**
- Create: `backend/database/src/commands/migrate-data-api.spec.ts`
- Modify: `backend/database/package.json`

**Interfaces:**
- Consumes: `backend/database/package.json`의 `scripts["db:migrate:data-api"]`
- Produces: `tsx src/commands/migrate-data-api.ts`로 고정된 production migration 진입점

- [ ] **Step 1: Drizzle Kit CLI를 검출하는 실패 테스트 작성**

```ts
/** 운영 migration이 현재 package의 runtime command를 사용하는지 검증한다 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface DatabasePackageJson {
  scripts: Record<string, string>;
}

describe('운영 Data API migration command', () => {
  it('Drizzle Kit CLI 대신 package의 runtime command를 실행한다', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as DatabasePackageJson;

    expect(packageJson.scripts['db:migrate:data-api']).toBe(
      'tsx src/commands/migrate-data-api.ts',
    );
  });
});
```

- [ ] **Step 2: 기존 CLI script 때문에 실패하는지 확인**

Run: `pnpm exec vitest run backend/database/src/commands/migrate-data-api.spec.ts`

Expected: FAIL; received `drizzle-kit migrate --config drizzle.data-api.config.ts`.

- [ ] **Step 3: package script를 runtime command로 변경**

```json
"db:migrate:data-api": "tsx src/commands/migrate-data-api.ts"
```

- [ ] **Step 4: 회귀 테스트 통과 확인**

Run: `pnpm exec vitest run backend/database/src/commands/migrate-data-api.spec.ts`

Expected: PASS, 1 test passed.

### Task 2: Migration 실행 경계

**Files:**
- Create: `backend/database/src/operations/run-data-api-migration.spec.ts`
- Create: `backend/database/src/operations/run-data-api-migration.ts`

**Interfaces:**
- Consumes: `RunDataApiMigrationOptions`
- Produces: `runDataApiMigration(options): Promise<void>`

- [ ] **Step 1: 성공·실패 자원 정리 테스트 작성**

```ts
/** Data API migration의 로그와 client 정리 경계를 검증한다 */
import { describe, expect, it } from 'vitest';

import { runDataApiMigration } from './run-data-api-migration.js';

describe('runDataApiMigration', () => {
  it('migration 성공을 기록하고 client를 정리한다', async () => {
    const events: string[] = [];

    await runDataApiMigration({
      migrate: () => {
        events.push('migrate');
        return Promise.resolve();
      },
      destroy: () => {
        events.push('destroy');
      },
      onSuccess: () => {
        events.push('success');
      },
      onError: () => {
        events.push('error');
      },
    });

    expect(events).toEqual(['migrate', 'success', 'destroy']);
  });

  it('migration 실패 원본을 기록하고 client를 정리한 뒤 다시 반환한다', async () => {
    const failure = new Error('migration 실패');
    const events: string[] = [];
    let loggedError: unknown;

    const result = runDataApiMigration({
      migrate: () => {
        events.push('migrate');
        return Promise.reject(failure);
      },
      destroy: () => {
        events.push('destroy');
      },
      onSuccess: () => {
        events.push('success');
      },
      onError: (error) => {
        events.push('error');
        loggedError = error;
      },
    });

    await expect(result).rejects.toBe(failure);
    expect(loggedError).toBe(failure);
    expect(events).toEqual(['migrate', 'error', 'destroy']);
  });
});
```

- [ ] **Step 2: 구현 파일 부재로 실패하는지 확인**

Run: `pnpm exec vitest run backend/database/src/operations/run-data-api-migration.spec.ts`

Expected: FAIL because `./run-data-api-migration.js` cannot be resolved.

- [ ] **Step 3: 최소 실행 경계 구현**

```ts
/** Data API migration의 성공·실패 로그와 client 정리를 한 경계에서 관리한다 */
export interface RunDataApiMigrationOptions {
  migrate: () => Promise<void>;
  destroy: () => void;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

/** migration 결과를 기록하고 client를 항상 정리한다 */
export const runDataApiMigration = async ({
  migrate,
  destroy,
  onSuccess,
  onError,
}: RunDataApiMigrationOptions): Promise<void> => {
  try {
    await migrate();
    onSuccess();
  } catch (error) {
    onError(error);
    throw error;
  } finally {
    destroy();
  }
};
```

- [ ] **Step 4: 실행 경계 테스트 통과 확인**

Run: `pnpm exec vitest run backend/database/src/operations/run-data-api-migration.spec.ts`

Expected: PASS, 2 tests passed.

### Task 3: Runtime Data API migration command

**Files:**
- Create: `backend/database/src/commands/migrate-data-api.ts`
- Delete: `backend/database/drizzle.data-api.config.ts`

**Interfaces:**
- Consumes: `RDS_RESOURCE_ARN`, `RDS_SECRET_ARN`, `DATABASE_NAME`, `AWS_REGION`, `runDataApiMigration()`
- Produces: 현재 SDK와 Drizzle runtime migrator를 사용하는 production command

- [ ] **Step 1: Runtime command 구현**

```ts
/** 현재 AWS SDK와 Drizzle ORM으로 운영 Aurora migration을 실행한다 */
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';

import { runDataApiMigration } from '../operations/run-data-api-migration.js';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const resourceArn = requireEnv('RDS_RESOURCE_ARN');
const secretArn = requireEnv('RDS_SECRET_ARN');
const database = requireEnv('DATABASE_NAME');
const region = requireEnv('AWS_REGION');
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);
const client = new RDSDataClient({ region });
const db = drizzle(client, {
  database,
  resourceArn,
  secretArn,
  logger: {
    logQuery(query) {
      console.info(`[migration SQL]\n${query}`);
    },
  },
});

try {
  await runDataApiMigration({
    migrate: () => migrate(db, { migrationsFolder }),
    destroy: () => {
      client.destroy();
    },
    onSuccess: () => {
      console.info('운영 Data API migration 완료');
    },
    onError: (error) => {
      console.error('운영 Data API migration 실패:', error);
    },
  });
} catch {
  process.exitCode = 1;
}
```

- [ ] **Step 2: CLI 전용 config 제거**

Delete `backend/database/drizzle.data-api.config.ts`; local generate와 local migrate config는 유지한다.

- [ ] **Step 3: database 범위 검증**

Run: `pnpm exec vitest run backend/database/src/commands/migrate-data-api.spec.ts backend/database/src/operations/run-data-api-migration.spec.ts backend/database/src/operations/wait-for-data-api.spec.ts`

Expected: PASS, 6 tests passed.

Run: `pnpm --filter @flex-thia/database typecheck`

Expected: exit 0 with no TypeScript errors.

### Task 4: 전체·실환경 rollback 검증과 커밋

**Files:**
- Verify: repository and production Aurora
- Commit: Tasks 1–3 files

**Interfaces:**
- Consumes: local AWS profile `flex-thia-admin`
- Produces: 현재 runtime migrator의 전체 migration 성공 및 rollback 증거

- [ ] **Step 1: 저장소 전체 검증**

Run: `pnpm check`

Expected: exit 0; formatting, lint, typecheck, tests, build all pass.

Run: `pnpm infra:synth`

Expected: exit 0 and all production stacks synthesize.

- [ ] **Step 2: 실제 runtime migrator를 rollback-only client로 실행**

`RDSDataClient.send`를 진단 transaction 안에서 감싸 모든
`ExecuteStatementCommand`에 같은 transaction ID를 넣고, Drizzle의
`CommitTransactionCommand`는 성공 응답만 반환한 뒤 마지막에 실제
`RollbackTransactionCommand`를 보낸다.

Run: `AWS_PROFILE=flex-thia-admin AWS_REGION=ap-northeast-2 RDS_RESOURCE_ARN=arn:aws:rds:ap-northeast-2:330422589765:cluster:flexthiadataprod-databaseb269d8bb-xbt5bomxnmkd RDS_SECRET_ARN=arn:aws:secretsmanager:ap-northeast-2:330422589765:secret:FlexThiaDataProdDatabaseSec-6UZzVCQlB2ef-WESIZw DATABASE_NAME=flex_thia node /tmp/flex-thia-diagnose-drizzle-migrator.mjs`

Expected: 37 Drizzle queries succeed and the external transaction rolls back.

- [ ] **Step 3: 운영 DB에 진단 흔적이 없는지 확인**

Run: `aws --profile flex-thia-admin --region ap-northeast-2 rds-data execute-statement --resource-arn arn:aws:rds:ap-northeast-2:330422589765:cluster:flexthiadataprod-databaseb269d8bb-xbt5bomxnmkd --secret-arn arn:aws:secretsmanager:ap-northeast-2:330422589765:secret:FlexThiaDataProdDatabaseSec-6UZzVCQlB2ef-WESIZw --database flex_thia --sql "select schemaname, tablename from pg_tables where schemaname in ('public', 'drizzle') order by schemaname, tablename" --format-records-as JSON`

Expected: `formattedRecords` is `[]`.

- [ ] **Step 4: 변경 범위 검토와 커밋**

Run: `git diff --check && git status --short && git diff --stat`

Expected: only the approved runtime migration files and documents changed.

Run: `git add backend/database/src/commands/migrate-data-api.spec.ts backend/database/src/commands/migrate-data-api.ts backend/database/src/operations/run-data-api-migration.spec.ts backend/database/src/operations/run-data-api-migration.ts backend/database/package.json backend/database/drizzle.data-api.config.ts`

Run: `git commit -m "fix: run data api migration with current sdk"`

Expected: commit succeeds.
